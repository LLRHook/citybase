extends Node3D
class_name CityBuilder
# CityBuilder — builds the 3D city from a real snapshot (FEAT-024).
#
# Districts = top-level folders (root files → 'core'), seated on concentric
# rings sized so platforms never overlap. Buildings are procedural meshes
# weighted by blob size (snapshot.fileSizes) and typed by extension:
#   code    → segmented tower with a roof light
#   docs    → low, wide slab
#   config  → compact cylinder
#   other   → plain block
# Dirty files override emission: staged green / unstaged amber (parity with
# the Electron city). Exposes building_position/glow/set_dirty for the
# avatar and event stream.

const DISTRICT_COLORS := [
	Color(0.36, 0.83, 1.0),
	Color(0.78, 0.56, 1.0),
	Color(1.0, 0.72, 0.29),
	Color(0.37, 0.89, 0.6),
	Color(1.0, 0.42, 0.54),
	Color(0.55, 0.68, 1.0),
	Color(0.99, 0.87, 0.45),
	Color(0.5, 0.94, 0.86),
]
const STAGED_GREEN := Color(0.37, 0.89, 0.6)
const UNSTAGED_AMBER := Color(1.0, 0.72, 0.29)
const MAX_BUILDINGS_PER_DISTRICT := 36

const CODE_EXTS := ["js", "jsx", "cjs", "mjs", "ts", "tsx", "gd", "py", "rs", "go", "sh"]
const DOC_EXTS := ["md", "txt", "rst", "html"]
const CONFIG_EXTS := ["json", "yml", "yaml", "toml", "cfg", "lock", "godot", "tscn", "gitignore"]

var reduced_motion := false

var _buildings := {}        # repo path -> { node, mat, base_color, base_energy }
var _district_centers := {} # district name -> Vector3
var _bounds_radius := 12.0

func bounds_radius() -> float:
	return _bounds_radius

func has_building(path: String) -> bool:
	return _buildings.has(path)

func building_position(path: String) -> Vector3:
	var b: Variant = _buildings.get(path)
	if b == null:
		return Vector3.ZERO
	return (b["node"] as Node3D).global_position

func building_paths() -> Array:
	return _buildings.keys()

func district_centers() -> Array:
	return _district_centers.values()

func district_center(path: String) -> Vector3:
	var slash := path.find("/")
	var district := "core" if slash == -1 else path.substr(0, slash)
	return _district_centers.get(district, Vector3.ZERO)

func build(snapshot: Dictionary) -> Dictionary:
	for child in get_children():
		child.queue_free()
	_buildings.clear()
	_district_centers.clear()

	var tree: Array = snapshot.get("repoTree", [])
	var sizes: Dictionary = snapshot.get("fileSizes", {})
	var districts := {}
	for p_variant in tree:
		var p := String(p_variant)
		var slash := p.find("/")
		var district := "core" if slash == -1 else p.substr(0, slash)
		if not districts.has(district):
			districts[district] = []
		(districts[district] as Array).append(p)

	var names := districts.keys()
	names.sort_custom(func(a, b): return (districts[a] as Array).size() > (districts[b] as Array).size())

	var seats := _seat_positions(names.size(), districts, names)
	for i in range(names.size()):
		var district_name: String = names[i]
		var files: Array = districts[district_name]
		var color: Color = DISTRICT_COLORS[i % DISTRICT_COLORS.size()]
		_build_district(district_name, files, sizes, color, seats[i])

	_apply_dirty(snapshot.get("files", []))
	return { "districts": names.size(), "buildings": _buildings.size() }

# Refresh dirty highlighting from a newer snapshot without rebuilding.
func set_dirty(files: Array) -> void:
	for b in _buildings.values():
		_set_building_emission(b, b["base_color"], b["base_energy"])
	_apply_dirty(files)

func glow(path: String, energy := 3.5, settle := 0.9) -> bool:
	var b: Variant = _buildings.get(path)
	if b == null:
		return false
	var mat: StandardMaterial3D = b["mat"]
	mat.emission_energy_multiplier = energy
	if reduced_motion:
		mat.emission_energy_multiplier = settle
	else:
		var tween := create_tween()
		tween.tween_property(mat, "emission_energy_multiplier", settle, 2.0)
	return true

# ── internals ──

func _apply_dirty(files: Array) -> void:
	for f_variant in files:
		if not (f_variant is Dictionary):
			continue
		var f: Dictionary = f_variant
		var b: Variant = _buildings.get(String(f.get("path", "")))
		if b == null:
			continue
		# Parity with the Electron city: unstaged work-in-progress reads
		# amber; a fully staged change reads green.
		var color: Color = UNSTAGED_AMBER if f.get("unstaged", false) else STAGED_GREEN
		_set_building_emission(b, color, 1.6)

func _set_building_emission(b: Dictionary, color: Color, energy: float) -> void:
	var mat: StandardMaterial3D = b["mat"]
	mat.emission = color
	mat.emission_energy_multiplier = energy

func _seat_positions(count: int, districts: Dictionary, names: Array) -> Array:
	# Center seat + concentric rings. Ring radii grow with the widest platform
	# so footprints can't overlap regardless of district sizes.
	var seats: Array = []
	var max_side := 1.0
	for n in names:
		max_side = maxf(max_side, _grid_side((districts[n] as Array).size()))
	var platform := max_side * 1.15 + 2.4
	var ring1 := maxf(10.0, platform * 1.25)
	var ring2 := ring1 + platform * 1.2
	_bounds_radius = (ring2 if count > 7 else ring1) + platform * 0.75
	seats.append(Vector3.ZERO)
	for i in range(1, count):
		if i <= 6:
			var a1 := TAU * float(i - 1) / float(min(count - 1, 6))
			seats.append(Vector3(cos(a1), 0, sin(a1)) * ring1)
		else:
			var outer := count - 7
			var a2 := TAU * float(i - 7) / float(max(outer, 1)) + 0.26
			seats.append(Vector3(cos(a2), 0, sin(a2)) * ring2)
	return seats

func _grid_side(file_count: int) -> float:
	return ceil(sqrt(float(mini(file_count, MAX_BUILDINGS_PER_DISTRICT))))

func _build_district(district_name: String, files: Array, sizes: Dictionary, color: Color, center: Vector3) -> void:
	_district_centers[district_name] = center
	var shown := mini(files.size(), MAX_BUILDINGS_PER_DISTRICT)
	var side := int(_grid_side(files.size()))
	var span := side * 1.15 + 1.6

	var platform := MeshInstance3D.new()
	var pmesh := BoxMesh.new()
	pmesh.size = Vector3(span, 0.3, span)
	var pmat := StandardMaterial3D.new()
	pmat.albedo_color = Color(0.05, 0.07, 0.12)
	pmat.emission_enabled = true
	pmat.emission = color
	pmat.emission_energy_multiplier = 0.22
	pmesh.material = pmat
	platform.mesh = pmesh
	platform.position = center + Vector3(0, -0.15, 0)
	add_child(platform)

	var trim := MeshInstance3D.new()
	var tmesh := BoxMesh.new()
	tmesh.size = Vector3(span + 0.24, 0.08, span + 0.24)
	var tmat := StandardMaterial3D.new()
	tmat.albedo_color = color.darkened(0.4)
	tmat.emission_enabled = true
	tmat.emission = color
	tmat.emission_energy_multiplier = 1.1
	tmesh.material = tmat
	trim.mesh = tmesh
	trim.position = center + Vector3(0, -0.31, 0)
	add_child(trim)

	var label := Label3D.new()
	label.text = "%s · %d" % [district_name, files.size()]
	label.font_size = 72
	label.outline_size = 14
	label.modulate = color
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.position = center + Vector3(0, 0.5, span / 2.0 + 0.9)
	add_child(label)

	for i in range(shown):
		var path := String(files[i])
		var gx := (i % side) - side / 2.0 + 0.5
		var gz := float(i / side) - side / 2.0 + 0.5
		var pos := center + Vector3(gx * 1.15, 0, gz * 1.15)
		_add_building(path, sizes.get(path, 0), color, pos)

func _add_building(path: String, size_bytes: int, color: Color, ground: Vector3) -> void:
	var height := clampf(0.6 + 0.55 * (log(1.0 + float(size_bytes) / 256.0) / log(2.0)), 0.6, 6.0)
	var kind := _kind_for(path)
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(path)
	var hue_jitter := rng.randf_range(-0.03, 0.03)
	var base := Color.from_hsv(wrapf(color.h + hue_jitter, 0.0, 1.0), color.s, color.v)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = base.darkened(0.68)
	mat.emission_enabled = true
	mat.emission = base
	var base_energy := 0.5
	mat.emission_energy_multiplier = base_energy

	var node := MeshInstance3D.new()
	match kind:
		"docs":
			height = min(height, 1.1)
			var m := BoxMesh.new()
			m.size = Vector3(1.0, height, 0.95)
			m.material = mat
			node.mesh = m
		"config":
			var c := CylinderMesh.new()
			c.height = min(height, 1.6)
			c.top_radius = 0.34
			c.bottom_radius = 0.42
			c.material = mat
			node.mesh = c
			height = c.height
		"code":
			var t := BoxMesh.new()
			t.size = Vector3(0.78, height, 0.78)
			t.material = mat
			node.mesh = t
		_:
			var b := BoxMesh.new()
			b.size = Vector3(0.85, min(height, 2.2), 0.85)
			b.material = mat
			node.mesh = b
			height = b.size.y
	node.position = ground + Vector3(0, height / 2.0, 0)
	add_child(node)

	if kind == "code" and height > 2.0:
		var roof := MeshInstance3D.new()
		var rmesh := BoxMesh.new()
		rmesh.size = Vector3(0.3, 0.12, 0.3)
		var rmat := StandardMaterial3D.new()
		rmat.emission_enabled = true
		rmat.emission = base
		rmat.emission_energy_multiplier = 2.2
		rmesh.material = rmat
		roof.mesh = rmesh
		roof.position = ground + Vector3(0, height + 0.08, 0)
		add_child(roof)

	_buildings[path] = { "node": node, "mat": mat, "base_color": base, "base_energy": base_energy }

func _kind_for(path: String) -> String:
	var ext := path.get_extension().to_lower()
	if ext in CODE_EXTS:
		return "code"
	if ext in DOC_EXTS:
		return "docs"
	if ext in CONFIG_EXTS:
		return "config"
	return "other"
