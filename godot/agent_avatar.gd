extends Node3D
class_name AgentAvatar
# AgentAvatar — the visible agent presence (FEAT-024). A glowing drone that
# flies to the building each live tool-use event touches, hovers while the
# agent works, and plays an expanding resolve ripple when the run settles.

const AVATAR_COLOR := Color(0.36, 0.83, 1.0)

var reduced_motion := false

var _body: MeshInstance3D
var _light: OmniLight3D
var _active := false
var _hover_t := 0.0
var _base_y := 2.6
var _move_tween: Tween

func _ready() -> void:
	_body = MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.48
	mesh.height = 0.96
	var mat := StandardMaterial3D.new()
	mat.albedo_color = AVATAR_COLOR.darkened(0.3)
	mat.emission_enabled = true
	mat.emission = AVATAR_COLOR
	mat.emission_energy_multiplier = 2.4
	mesh.material = mat
	_body.mesh = mesh
	add_child(_body)

	var ring := MeshInstance3D.new()
	var rmesh := TorusMesh.new()
	rmesh.inner_radius = 0.44
	rmesh.outer_radius = 0.52
	var rmat := StandardMaterial3D.new()
	rmat.emission_enabled = true
	rmat.emission = AVATAR_COLOR
	rmat.emission_energy_multiplier = 1.6
	rmesh.material = rmat
	ring.mesh = rmesh
	_body.add_child(ring)

	_light = OmniLight3D.new()
	_light.light_color = AVATAR_COLOR
	_light.light_energy = 1.4
	_light.omni_range = 6.0
	add_child(_light)

	# A ground-to-sky beam makes the agent's position readable at any zoom.
	var beam := MeshInstance3D.new()
	var bmesh := CylinderMesh.new()
	bmesh.height = 14.0
	bmesh.top_radius = 0.05
	bmesh.bottom_radius = 0.16
	var bmat := StandardMaterial3D.new()
	bmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	bmat.albedo_color = Color(AVATAR_COLOR.r, AVATAR_COLOR.g, AVATAR_COLOR.b, 0.28)
	bmat.emission_enabled = true
	bmat.emission = AVATAR_COLOR
	bmat.emission_energy_multiplier = 1.8
	bmat.cull_mode = BaseMaterial3D.CULL_DISABLED
	bmesh.material = bmat
	beam.mesh = bmesh
	beam.position = Vector3(0, -_base_y + 7.0, 0)
	add_child(beam)

	visible = false
	position = Vector3(0, _base_y, 0)

func _process(delta: float) -> void:
	if not visible or reduced_motion:
		return
	_hover_t += delta
	_body.position.y = sin(_hover_t * 2.4) * 0.14
	_body.rotate_y(delta * (2.2 if _active else 0.7))

func begin_run(origin: Vector3) -> void:
	visible = true
	_active = true
	_snap_or_tween(origin + Vector3(0, _base_y, 0))

func move_to_building(building_top: Vector3) -> void:
	visible = true
	_active = true
	_snap_or_tween(building_top + Vector3(0, 1.0, 0))

func settle(status: String, at: Vector3) -> void:
	_active = false
	_spawn_ripple(at, Color(0.37, 0.89, 0.6) if status == "done" else Color(1.0, 0.42, 0.54))
	if reduced_motion:
		visible = false
		return
	var tween := create_tween()
	tween.tween_property(self, "position", Vector3(0, _base_y + 4.0, 0), 1.6)
	tween.tween_callback(func(): visible = false)

func _snap_or_tween(target: Vector3) -> void:
	if _move_tween and _move_tween.is_valid():
		_move_tween.kill()
	if reduced_motion:
		position = target
		return
	_move_tween = create_tween()
	_move_tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	_move_tween.tween_property(self, "position", target, 0.7)

func _spawn_ripple(at: Vector3, color: Color) -> void:
	var ripple := MeshInstance3D.new()
	var mesh := TorusMesh.new()
	mesh.inner_radius = 0.5
	mesh.outer_radius = 0.62
	var mat := StandardMaterial3D.new()
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(color.r, color.g, color.b, 0.8)
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 2.0
	mesh.material = mat
	ripple.mesh = mesh
	ripple.position = Vector3(at.x, 0.25, at.z)
	get_parent().add_child(ripple)
	if reduced_motion:
		get_tree().create_timer(1.2).timeout.connect(func(): ripple.queue_free())
		return
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(ripple, "scale", Vector3(14, 1, 14), 2.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(mat, "albedo_color:a", 0.0, 2.2)
	tween.chain().tween_callback(func(): ripple.queue_free())
