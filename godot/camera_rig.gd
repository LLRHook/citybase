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

func _ready() -> void:
	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_PERSPECTIVE
	_camera.fov = 38.0
	add_child(_camera)
	_apply()

func frame_radius(radius: float) -> void:
	_distance = clampf(radius * 1.85, 14.0, 90.0)
	_apply()

func fly_to(world_point: Vector3) -> void:
	if _user_drove_recently > 0.0:
		return
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
			if mb.pressed:
				_user_drove_recently = 4.0
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_distance = clampf(_distance * 0.92, 10.0, 90.0)
			_user_drove_recently = 4.0
			_apply()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_distance = clampf(_distance * 1.08, 10.0, 90.0)
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
