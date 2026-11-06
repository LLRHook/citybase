extends Node3D
class_name CameraRig
# CameraRig — orbit/zoom camera with smooth fly-to (FEAT-024).
# Drag to orbit, wheel to zoom; fly_to() eases the focus toward live agent
# activity without stealing an in-progress user drag.

var reduced_motion := false

var _camera: Camera3D
var _yaw := -0.78
var _pitch := -0.62
var _distance := 34.0
var _target := Vector3.ZERO
var _dragging := false
var _user_drove_recently := 0.0
var _fly_tween: Tween
var _auto_frame := false
var _framing_points: Array = []
var _max_distance := 90.0

# The lower panels begin at 62% height; leave space above them and below vitals.
const FRAME_RECT := Rect2(0.04, 0.16, 0.92, 0.44)

func _ready() -> void:
	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_PERSPECTIVE
	_camera.fov = 38.0
	_camera.keep_aspect = Camera3D.KEEP_HEIGHT
	add_child(_camera)
	_apply()
	get_viewport().size_changed.connect(_on_viewport_resized)

func frame_radius(radius: float) -> void:
	frame_bounds(AABB(Vector3(-radius, -0.5, -radius), Vector3(radius * 2.0, 7, radius * 2.0)))

func frame_bounds(bounds: AABB) -> void:
	var points: Array = []
	for corner in 8:
		points.append(bounds.get_endpoint(corner))
	frame_points(points)

func frame_points(points: Array) -> void:
	if points.is_empty():
		return
	_framing_points = points
	_auto_frame = true
	var bounds := AABB(points[0], Vector3.ZERO)
	for point: Vector3 in points:
		bounds = bounds.expand(point)
	var center := bounds.get_center()
	_target = center
	_apply()
	var basis := _camera.transform.basis
	var aspect := get_viewport().get_visible_rect().size.aspect()
	var tan_vertical := tan(deg_to_rad(_camera.fov) * 0.5)
	var tan_horizontal := tan_vertical * aspect
	var top := 1.0 - 2.0 * FRAME_RECT.position.y
	var bottom := 2.0 * FRAME_RECT.end.y - 1.0
	var center_y := 1.0 - 2.0 * FRAME_RECT.get_center().y
	_distance = 10.0
	for point: Vector3 in points:
		var p: Vector3 = basis.inverse() * (point - center)
		# Fit the actual perspective depth of each corner in the HUD-free rect.
		_distance = maxf(_distance, p.z + absf(p.x) / (tan_horizontal * FRAME_RECT.size.x))
		_distance = maxf(_distance, (p.y / tan_vertical + top * p.z) / (top - center_y))
		_distance = maxf(_distance, (bottom * p.z - p.y / tan_vertical) / (bottom + center_y))
	_distance *= 1.04
	_target = center - basis.y * center_y * _distance * tan_vertical
	_max_distance = maxf(90.0, _distance * 2.0)
	_camera.far = maxf(1000.0, _max_distance + bounds.size.length())
	_apply()

func _on_viewport_resized() -> void:
	if _auto_frame:
		frame_points(_framing_points)

func fly_to(world_point: Vector3) -> void:
	if _user_drove_recently > 0.0:
		return
	_auto_frame = false
	if reduced_motion:
		_target = world_point
		_apply()
		return
	if _fly_tween and _fly_tween.is_valid():
		_fly_tween.kill()
	_fly_tween = create_tween()
	_fly_tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	_fly_tween.tween_method(_set_target, _target, world_point, 0.9)

func _set_target(t: Vector3) -> void:
	_target = t
	_apply()

func _process(delta: float) -> void:
	if _user_drove_recently > 0.0:
		_user_drove_recently = max(0.0, _user_drove_recently - delta)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			_dragging = mb.pressed
			_auto_frame = false
			if mb.pressed:
				_user_drove_recently = 4.0
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_auto_frame = false
			_distance = clampf(_distance * 0.92, 10.0, _max_distance)
			_user_drove_recently = 4.0
			_apply()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_auto_frame = false
			_distance = clampf(_distance * 1.08, 10.0, _max_distance)
			_user_drove_recently = 4.0
			_apply()
	elif event is InputEventMouseMotion and _dragging:
		var mm := event as InputEventMouseMotion
		_yaw -= mm.relative.x * 0.008
		_pitch = clampf(_pitch - mm.relative.y * 0.006, -1.35, -0.18)
		_apply()

func _apply() -> void:
	var offset := Vector3(
		cos(_pitch) * sin(_yaw),
		-sin(_pitch),
		cos(_pitch) * cos(_yaw),
	) * _distance
	_camera.position = _target + offset
	_camera.look_at_from_position(_camera.position, _target, Vector3.UP)
