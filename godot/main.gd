extends Node3D
# Citybase v4 spike (FEAT-023) — the go/no-go gate for the Godot frontend.
#
# What it proves, end to end:
#   1. Spawn the citybase-core daemon with a session token (env-passed;
#      Godot children inherit OS.set_environment values).
#   2. Speak the WS JSON-RPC protocol (docs/v4-game-engine.md).
#   3. Render a REAL repo snapshot as a lit, glowing 3D city.
#   4. React to the live agent-event stream (touched files glow their
#      buildings) and show the event trail in a text panel.
#
# Autotest mode (CITYBASE_SPIKE_OUT set): saves screenshots at each gate
# step and quits — CI/agent-verifiable without a human at the window.
# Optional CITYBASE_SPIKE_RUN=1 dispatches a real (cheap) claude run.

const CORE_PORT := 43117
const DISTRICT_COLORS := [
	Color(0.36, 0.83, 1.0),  # cyan
	Color(0.78, 0.56, 1.0),  # violet
	Color(1.0, 0.72, 0.29),  # amber
	Color(0.37, 0.89, 0.6),  # green
	Color(1.0, 0.42, 0.54),  # red
	Color(0.55, 0.68, 1.0),  # blue
]

var _core_pid := -1
var _token := ""
var _repo_root := ""
var _ws := WebSocketPeer.new()
var _ws_connected := false
var _reconnecting := false
var _next_id := 0
var _pending := {}          # id -> Callable
var _buildings := {}        # repo-relative path -> MeshInstance3D
var _district_of := {}      # path -> district name
var _log_label: RichTextLabel
var _fps_label: Label
var _spike_out := ""
var _did_snapshot := false
var _run_id := ""
var _shots_taken := {}

func _ready() -> void:
	_spike_out = OS.get_environment("CITYBASE_SPIKE_OUT")
	# In exported builds res:// lives inside the pck and has no filesystem
	# path — the repo root must come from the environment there. Editor/CLI
	# runs fall back to the project's parent directory.
	_repo_root = OS.get_environment("CITYBASE_REPO_ROOT")
	if _repo_root == "":
		_repo_root = ProjectSettings.globalize_path("res://").get_base_dir().get_base_dir()
	_build_stage()
	_log("spike boot · repo root: %s" % _repo_root)
	_spawn_core()
	_connect_ws()

func _exit_tree() -> void:
	if _core_pid > 0:
		OS.kill(_core_pid)

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST and _core_pid > 0:
		OS.kill(_core_pid)

# ── Core daemon ──

func _spawn_core() -> void:
	var crypto := Crypto.new()
	_token = crypto.generate_random_bytes(24).hex_encode()
	OS.set_environment("CITYBASE_CORE_TOKEN", _token)
	OS.set_environment("CITYBASE_CORE_PORT", str(CORE_PORT))
	var server := _repo_root.path_join("core/server.cjs")
	var node_bin := _find_node()
	if node_bin == "":
		_log("[color=red]FAIL: no node binary found[/color]")
		return
	_core_pid = OS.create_process(node_bin, [server])
	_log("core spawned · pid %d · %s" % [_core_pid, node_bin])

func _find_node() -> String:
	for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]:
		if FileAccess.file_exists(candidate):
			return candidate
	# Fall back to PATH resolution (works when launched from a shell).
	var out := []
	if OS.execute("/usr/bin/which", ["node"], out) == 0 and out.size() > 0:
		return String(out[0]).strip_edges()
	return ""

# ── WebSocket JSON-RPC client ──

func _connect_ws() -> void:
	var url := "ws://127.0.0.1:%d/?token=%s" % [CORE_PORT, _token]
	var err := _ws.connect_to_url(url)
	if err != OK:
		_log("[color=red]ws connect error %d[/color]" % err)

func _process(_delta: float) -> void:
	if _fps_label:
		_fps_label.text = "%d fps" % Engine.get_frames_per_second()
	_ws.poll()
	var state := _ws.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not _ws_connected:
			_ws_connected = true
			_log("[color=green]connected to citybase-core[/color]")
		while _ws.get_available_packet_count() > 0:
			_on_message(_ws.get_packet().get_string_from_utf8())
	elif state == WebSocketPeer.STATE_CLOSED and not _ws_connected and not _reconnecting:
		# Core may still be booting; retry until it accepts.
		_reconnecting = true
		await get_tree().create_timer(0.5).timeout
		_ws = WebSocketPeer.new()
		_connect_ws()
		_reconnecting = false

func _call_rpc(method: String, params: Array, on_result: Callable) -> void:
	_next_id += 1
	_pending[_next_id] = on_result
	_ws.send_text(JSON.stringify({"id": _next_id, "method": method, "params": params}))

func _on_message(raw: String) -> void:
	var msg: Variant = JSON.parse_string(raw)
	if msg == null:
		return
	if msg.has("event"):
		_on_event(msg)
		return
	# JSON numbers arrive as floats in Godot; our request ids are ints.
	var mid := int(msg.get("id", -1))
	var cb: Variant = _pending.get(mid)
	if cb == null:
		return
	_pending.erase(mid)
	if msg.has("error"):
		_log("[color=red]rpc error: %s[/color]" % msg["error"].get("message", "?"))
	else:
		(cb as Callable).call(msg.get("result"))

func _on_event(msg: Dictionary) -> void:
	match msg.get("event"):
		"boot":
			_on_boot(msg.get("payload", {}))
		"agent-event":
			_on_agent_event(msg.get("payload", {}))

# ── Boot → snapshot → city ──

func _on_boot(payload: Dictionary) -> void:
	var detect: Dictionary = payload.get("detect", {})
	_log("boot · claude installed: %s" % str(detect.get("claude", {}).get("found", false)))
	var workspace: Variant = payload.get("workspace")
	if workspace is Dictionary and workspace.has("id"):
		_load_snapshot(workspace["id"])
	else:
		_call_rpc("workspace.registerPath", [_repo_root], func(ws: Variant) -> void:
			if ws is Dictionary:
				_load_snapshot(ws["id"]))

func _load_snapshot(workspace_id: String) -> void:
	_call_rpc("git.getSnapshot", [workspace_id], func(snap: Variant) -> void:
		if not (snap is Dictionary):
			return
		_log("snapshot · branch %s · %d tracked files" % [str(snap.get("branch")), (snap.get("repoTree", []) as Array).size()])
		_build_city(snap)
		_did_snapshot = true
		_shot("spike-01-city")
		if OS.get_environment("CITYBASE_SPIKE_RUN") == "1":
			_dispatch_run(snap)
		elif _spike_out != "":
			_quit_soon(2.0))

func _build_city(snap: Dictionary) -> void:
	var tree: Array = snap.get("repoTree", [])
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

	var index := 0
	for district_name in names:
		var files: Array = districts[district_name]
		var color: Color = DISTRICT_COLORS[index % DISTRICT_COLORS.size()]
		var center := _district_seat(index, names.size())
		_add_platform(center, color, district_name, files.size())
		var side := int(ceil(sqrt(float(mini(files.size(), 25)))))
		for i in range(mini(files.size(), 25)):
			var gx := (i % side) - side / 2.0 + 0.5
			var gz := (i / side) - side / 2.0 + 0.5
			var height := 0.5 + 2.2 * (0.3 + 0.7 * randf_seeded(hash(files[i])))
			var pos := center + Vector3(gx * 1.1, height / 2.0, gz * 1.1)
			var building := _add_building(pos, height, color)
			_buildings[String(files[i])] = building
			_district_of[String(files[i])] = district_name
		index += 1
	_log("city built · %d districts · %d buildings" % [names.size(), _buildings.size()])

func randf_seeded(seed_value: int) -> float:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	return rng.randf()

func _district_seat(index: int, total: int) -> Vector3:
	if index == 0:
		return Vector3.ZERO
	var ring_angle := TAU * float(index - 1) / float(maxi(total - 1, 1))
	return Vector3(cos(ring_angle), 0, sin(ring_angle)) * 9.5

func _add_platform(center: Vector3, color: Color, district_name: String, file_count: int) -> void:
	var mesh := BoxMesh.new()
	mesh.size = Vector3(6.5, 0.25, 6.5)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.06, 0.08, 0.14)
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 0.25
	mesh.material = mat
	var inst := MeshInstance3D.new()
	inst.mesh = mesh
	inst.position = center + Vector3(0, -0.125, 0)
	add_child(inst)

	var label := Label3D.new()
	label.text = "%s · %d" % [district_name, file_count]
	label.font_size = 64
	label.modulate = color
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.position = center + Vector3(0, 0.4, 4.0)
	add_child(label)

func _add_building(pos: Vector3, height: float, color: Color) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.85, height, 0.85)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color.darkened(0.65)
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 0.55
	mesh.material = mat
	var inst := MeshInstance3D.new()
	inst.mesh = mesh
	inst.position = pos
	add_child(inst)
	return inst

# ── Live run → glow ──

func _dispatch_run(snap: Dictionary) -> void:
	var params := {
		"provider": "claude",
		"questId": "spike-%d" % (Time.get_ticks_msec()),
		"adventurerId": "godot-spike",
		"skill": "docs",
		"workspaceId": snap.get("workspaceId"),
		"branch": snap.get("branch", "main"),
		"promptContext": "Read the file README.md and reply with its first line only. Do not create, modify, or delete anything.",
	}
	_log("dispatching claude run…")
	_call_rpc("agent.startRun", [params], func(run: Variant) -> void:
		if run is Dictionary:
			_run_id = String(run.get("runId", ""))
			_log("run started · %s" % _run_id.substr(0, 8)))

func _on_agent_event(payload: Dictionary) -> void:
	var event: Dictionary = payload.get("event", {})
	var kind := String(event.get("kind", "?"))
	var text := String(event.get("text", ""))
	_log("[color=cyan]%s[/color] %s" % [kind, text.substr(0, 160)])
	var touched := _touched_path(event)
	if touched != "":
		_glow(touched)
		_shot("spike-02-glow")
	# Autotest exit: once a glow was captured, any further event means the
	# stream is flowing — grab the final frame and quit.
	if _spike_out != "" and _shots_taken.has("spike-02-glow"):
		_quit_soon(3.0)

func _touched_path(event: Dictionary) -> String:
	var payload: Variant = event.get("payload")
	if payload is Dictionary:
		for key in ["path", "file", "file_path"]:
			if payload.has(key):
				return _to_repo_relative(String(payload[key]))
		var paths: Variant = payload.get("paths")
		if paths is Array and paths.size() > 0:
			return _to_repo_relative(String(paths[0]))
	return ""

func _to_repo_relative(p: String) -> String:
	var norm := p.replace("\\", "/")
	var root := _repo_root.replace("\\", "/")
	if norm.begins_with(root):
		return norm.substr(root.length()).trim_prefix("/")
	return norm

func _glow(path: String) -> void:
	var building: Variant = _buildings.get(path)
	if building == null:
		# Unknown file (e.g. newly created): glow the district platform via log only.
		_log("[color=yellow]touched (new): %s[/color]" % path)
		return
	var mesh_instance := building as MeshInstance3D
	var mat := (mesh_instance.mesh as BoxMesh).material as StandardMaterial3D
	mat.emission_energy_multiplier = 3.5
	var tween := create_tween()
	tween.tween_property(mat, "emission_energy_multiplier", 0.9, 2.0)
	_log("[color=green]glow: %s[/color]" % path)

# ── Stage, UI, evidence ──

func _build_stage() -> void:
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 26.0
	camera.position = Vector3(18, 18, 18)
	camera.look_at_from_position(camera.position, Vector3.ZERO, Vector3.UP)
	add_child(camera)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -30, 0)
	light.light_energy = 0.7
	add_child(light)

	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.02, 0.03, 0.06)
	env.glow_enabled = true
	env.glow_intensity = 0.9
	env.glow_bloom = 0.15
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	var canvas := CanvasLayer.new()
	add_child(canvas)
	var panel := PanelContainer.new()
	panel.anchor_left = 0.0
	panel.anchor_top = 0.62
	panel.anchor_right = 0.34
	panel.anchor_bottom = 1.0
	canvas.add_child(panel)
	_log_label = RichTextLabel.new()
	_log_label.bbcode_enabled = true
	_log_label.scroll_following = true
	panel.add_child(_log_label)
	_fps_label = Label.new()
	_fps_label.position = Vector2(12, 8)
	canvas.add_child(_fps_label)

func _log(line: String) -> void:
	print("[spike] " + line.replace("[color=red]", "").replace("[color=green]", "").replace("[color=cyan]", "").replace("[color=yellow]", "").replace("[/color]", ""))
	if _log_label:
		_log_label.append_text(line + "\n")

func _shot(name: String) -> void:
	if _spike_out == "" or _shots_taken.has(name):
		return
	_shots_taken[name] = true
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var out := _spike_out.path_join(name + ".png")
	img.save_png(out)
	_log("screenshot → " + out)

var _quitting := false
func _quit_soon(delay: float) -> void:
	if _quitting:
		return
	_quitting = true
	await get_tree().create_timer(delay).timeout
	_log("fps after warmup: %d" % Engine.get_frames_per_second())
	await _shot("spike-99-final")
	if _core_pid > 0:
		OS.kill(_core_pid)
	get_tree().quit()
