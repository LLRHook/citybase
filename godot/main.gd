extends Node3D
# Citybase v4 frontend — Phase C: the real 3D city (FEAT-024).
#
# Composition:
#   CityBuilder  — districts/buildings from the live snapshot (sizes + dirty)
#   AgentAvatar  — flies to each touched building; resolve ripple on settle
#   CameraRig    — orbit/zoom + fly-to-activity
#   main.gd      — core daemon lifecycle, WS JSON-RPC client, day cycle,
#                  event log panel, autotest harness
#
# Env:
#   CITYBASE_REPO_ROOT       repo root override (required in exported builds)
#   CITYBASE_SPIKE_OUT       autotest: screenshot dir; self-quits when done
#   CITYBASE_SPIKE_RUN=1     autotest: dispatch a real (cheap) claude run
#   CITYBASE_REDUCED_MOTION=1  disable tweens/hover/day-cycle animation

const CORE_PORT := 43117

# Preloads (not class_name globals): the global class cache only exists after
# an editor import pass, which CLI/autotest runs never perform.
const CityBuilder := preload("res://city_builder.gd")
const AgentAvatar := preload("res://agent_avatar.gd")
const CameraRig := preload("res://camera_rig.gd")
const Workbench := preload("res://workbench.gd")
const LivingLayer := preload("res://living_layer.gd")

var _core_pid := -1
var _token := ""
var _repo_root := ""
var _ws := WebSocketPeer.new()
var _ws_connected := false
var _reconnecting := false
var _next_id := 0
var _pending := {}
var _log_label: RichTextLabel
var _fps_label: Label
var _spike_out := ""
var _run_id := ""
var _workspace_id := ""
var _last_touched := Vector3.ZERO
var _shots_taken := {}
var _quitting := false
var _reduced_motion := false
var _day_t := 0.0

var _city: CityBuilder
var _avatar: AgentAvatar
var _rig: CameraRig
var _sun: DirectionalLight3D
var _bench: Workbench
var _living: LivingLayer
var _last_snapshot: Dictionary = {}

func _ready() -> void:
	_spike_out = OS.get_environment("CITYBASE_SPIKE_OUT")
	_reduced_motion = OS.get_environment("CITYBASE_REDUCED_MOTION") == "1"
	_repo_root = OS.get_environment("CITYBASE_REPO_ROOT")
	if _repo_root == "":
		_repo_root = ProjectSettings.globalize_path("res://").get_base_dir().get_base_dir()
	_build_stage()
	_log("citybase v4 · repo root: %s" % _repo_root)
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
	# Packaged builds ship a self-contained core (Node SEA binary) in the app
	# bundle — no node install, no repo checkout needed (FEAT-027). Dev runs
	# fall back to node + the repo's core/server.cjs.
	var bundled := OS.get_executable_path().get_base_dir().path_join("../Resources/citybase-core")
	if FileAccess.file_exists(bundled):
		_core_pid = OS.create_process(bundled, [])
		_log("core spawned (bundled) · pid %d" % _core_pid)
		return
	var server := _repo_root.path_join("core/server.cjs")
	var node_bin := _find_node()
	if node_bin == "":
		_log("[color=red]FAIL: no bundled core and no node binary found[/color]")
		return
	_core_pid = OS.create_process(node_bin, [server])
	_log("core spawned (dev) · pid %d" % _core_pid)

func _find_node() -> String:
	for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]:
		if FileAccess.file_exists(candidate):
			return candidate
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

func _process(delta: float) -> void:
	if _fps_label:
		_fps_label.text = "%d fps" % Engine.get_frames_per_second()
	if not _reduced_motion and _sun:
		_day_t += delta * 0.02
		_sun.rotation_degrees.y = -30 + sin(_day_t) * 28.0
		_sun.light_energy = 0.55 + 0.2 * (0.5 + 0.5 * cos(_day_t))
	_ws.poll()
	var state := _ws.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not _ws_connected:
			_ws_connected = true
			_log("[color=green]connected to citybase-core[/color]")
		while _ws.get_available_packet_count() > 0:
			_on_message(_ws.get_packet().get_string_from_utf8())
	elif state == WebSocketPeer.STATE_CLOSED and not _ws_connected and not _reconnecting:
		_reconnecting = true
		await get_tree().create_timer(0.5).timeout
		_ws = WebSocketPeer.new()
		_connect_ws()
		_reconnecting = false

# on_result receives the result, or null when the call errored (the error is
# logged); on_error (optional) receives the message.
func _call_rpc(method: String, params: Array, on_result: Callable, on_error: Callable = Callable()) -> void:
	_next_id += 1
	_pending[_next_id] = { "ok": on_result, "err": on_error }
	_ws.send_text(JSON.stringify({"id": _next_id, "method": method, "params": params}))

func _on_message(raw: String) -> void:
	var msg: Variant = JSON.parse_string(raw)
	if msg == null:
		return
	if msg.has("event"):
		match msg.get("event"):
			"boot":
				_on_boot(msg.get("payload", {}))
			"agent-event":
				_on_agent_event(msg.get("payload", {}))
		return
	var mid := int(msg.get("id", -1))
	var cb: Variant = _pending.get(mid)
	if cb == null:
		return
	_pending.erase(mid)
	if msg.has("error"):
		var emsg := String(msg["error"].get("message", "?"))
		_log("[color=red]rpc error: %s[/color]" % emsg)
		var err_cb: Callable = (cb as Dictionary).get("err", Callable())
		if err_cb.is_valid():
			err_cb.call(emsg)
	else:
		((cb as Dictionary)["ok"] as Callable).call(msg.get("result"))

# ── Boot → snapshot → city ──

func _on_boot(payload: Dictionary) -> void:
	var detect: Dictionary = payload.get("detect", {})
	_log("boot · claude installed: %s" % str(detect.get("claude", {}).get("found", false)))
	var workspace: Variant = payload.get("workspace")
	if workspace is Dictionary and workspace.has("id"):
		_load_snapshot(workspace["id"])
	elif FileAccess.file_exists(_repo_root.path_join("core/server.cjs")):
		# Dev convenience only: auto-register the checkout we're running from.
		_call_rpc("workspace.registerPath", [_repo_root], func(ws: Variant) -> void:
			if ws is Dictionary:
				_load_snapshot(ws["id"]))
	else:
		# Packaged first-run: no remembered workspace — ask for one.
		_bench.show_error("NO WORKSPACE", "Open a local Git repository to summon the city.")

func _load_snapshot(workspace_id: String) -> void:
	_workspace_id = workspace_id
	_call_rpc("git.getSnapshot", [workspace_id], func(snap: Variant) -> void:
		if not (snap is Dictionary):
			return
		var s: Dictionary = snap
		var snap_error: Variant = s.get("error")
		if snap_error is Dictionary:
			_bench.show_error(
				"NOT A GIT REPOSITORY" if (snap_error as Dictionary).get("kind") == "no-git" else "GIT SNAPSHOT FAILED",
				String((snap_error as Dictionary).get("message", "")),
			)
			return
		_bench.hide_error()
		_last_snapshot = s
		_log("snapshot · %s · %d files · %d dirty" % [
			str(s.get("branch")), (s.get("repoTree", []) as Array).size(), (s.get("files", []) as Array).size(),
		])
		_bench.set_workspace(str(s.get("rootPath", "")).get_file(), str(s.get("branch", "?")), (s.get("files", []) as Array).size())
		var stats: Dictionary = _city.build(s)
		_rig.frame_radius(_city.bounds_radius())
		_log("city built · %d districts · %d buildings" % [stats["districts"], stats["buildings"]])
		_refresh_quests()
		_refresh_runs()
		_call_rpc("agent.listRuns", [{}], func(runs: Variant) -> void:
			_living.update_snapshot(s, runs if runs is Array else []))
		_shot("city-01-built")
		_shot_after("city-04-living", 2.5)
		if OS.get_environment("CITYBASE_SPIKE_RUN") == "1":
			_bench.set_work_visible(true)
			_dispatch_run("Read the file README.md and reply with its first line only. Do not create, modify, or delete anything.")
		elif _spike_out != "":
			# Give the living layer (ambient motes, flicker, vitals) time to
			# appear in the city-04 shot before the idle autotest exits.
			_quit_soon(4.5))

func _refresh_quests() -> void:
	if _workspace_id == "":
		return
	_call_rpc("quests.list", [_workspace_id], func(quests: Variant) -> void:
		if quests is Array:
			_log("quest board · %d open items" % (quests as Array).size())
			_bench.set_quests(quests))

func _refresh_runs() -> void:
	_call_rpc("agent.listRuns", [{}], func(runs: Variant) -> void:
		if runs is Array:
			_bench.set_runs(runs))

# ── Live run → avatar + glow ──

func _dispatch_run(prompt: String) -> void:
	if prompt.strip_edges() == "" or _workspace_id == "":
		_log("[color=yellow]dispatch skipped: empty prompt or no workspace[/color]")
		return
	var params := {
		"provider": "claude",
		"questId": "wb-%d" % Time.get_ticks_msec(),
		"adventurerId": "godot",
		"skill": "refactor",
		"workspaceId": _workspace_id,
		"branch": _last_snapshot.get("branch", "main"),
		"promptContext": prompt,
		# Every dispatch can change files — gate it behind explicit approval,
		# the product's safety contract (BUG-004 parity in the engine).
		"approvalMode": "ask",
	}
	_log("dispatching claude run (gated)…")
	_call_rpc("agent.startRun", [params],
		func(run: Variant) -> void:
			if run is Dictionary:
				_run_id = String(run.get("runId", ""))
				_avatar.begin_run(Vector3.ZERO)
				_bench.run_started(_run_id)
				_refresh_runs()
				_log("run started · %s" % _run_id.substr(0, 8)),
		func(emsg: String) -> void:
			# Rejected at the gate (or dispatch failure): the run never spawned,
			# so no settle event will arrive — resolve the UI here.
			_bench.run_settled("cancelled" if emsg.contains("rejected") else "failed")
			_refresh_runs()
			_shot_after("wb-04-rejected", 0.4)
			if _spike_out != "":
				_quit_soon(2.0))

func _on_agent_event(payload: Dictionary) -> void:
	var event: Dictionary = payload.get("event", {})
	var kind := String(event.get("kind", "?"))
	var text := String(event.get("text", ""))
	_log("[color=cyan]%s[/color] %s" % [kind, text.substr(0, 140)])
	_bench.append_event(kind, text)
	_living.note_run_event(kind, text)

	var event_payload: Variant = event.get("payload")
	if event_payload is Dictionary:
		var ep: Dictionary = event_payload
		# Approval gate: the manager pre-registers the run and waits for a
		# verdict before any CLI spawns (BUG-004 contract).
		if ep.get("needsApproval", false):
			var pend_id := String(payload.get("runId", ""))
			_bench.show_approval(pend_id, ep.get("summary", {}))
			_shot_after("wb-02-approval", 0.4)
			var decision := OS.get_environment("CITYBASE_AUTOTEST_DECISION")
			if decision != "":
				get_tree().create_timer(1.2).timeout.connect(func():
					_bench._decide(decision == "approve"))
			return
		var status := String(ep.get("status", ""))
		if status in ["done", "failed", "cancelled"] and text.begins_with("agent run settled"):
			_on_run_settled(status)
			return

	var touched := _touched_path(event)
	if touched != "":
		var known: bool = _city.has_building(touched)
		var pos: Vector3 = _city.building_position(touched) if known else _city.district_center(touched)
		_last_touched = pos
		_avatar.move_to_building(pos)
		_rig.fly_to(pos)
		if known:
			_city.glow(touched)
		_log("[color=green]touch: %s[/color]" % touched)
		_shot_after("city-02-avatar", 0.85)

func _on_run_settled(status: String) -> void:
	_log("[color=green]run settled · %s[/color]" % status)
	_avatar.settle(status, _last_touched)
	_bench.run_settled(status)
	_refresh_runs()
	# Dirty state changed on disk — refresh highlighting from a new snapshot.
	if _workspace_id != "":
		_call_rpc("git.getSnapshot", [_workspace_id], func(snap: Variant) -> void:
			if snap is Dictionary:
				_city.set_dirty((snap as Dictionary).get("files", [])))
	# The no-code review surface: diff + checks feed the Outcome panel.
	# Checks run the repo's real npm scripts and can take ~30s+, so the
	# autotest quits after the outcome lands (with a generous backstop).
	_shot_after("city-03-resolve", 0.6)
	if _run_id != "":
		_call_rpc("agent.produceDiff", [_run_id],
			func(diff: Variant) -> void:
				if not (diff is Dictionary):
					_autotest_done()
					return
				_call_rpc("agent.runChecks", [_run_id],
					func(checks: Variant) -> void:
						_bench.show_outcome(diff, checks if checks is Array else [])
						await _shot_after("wb-03-outcome", 0.5)
						_autotest_done(),
					func(_e: String) -> void:
						_bench.show_outcome(diff, [])
						_autotest_done()),
			func(_e: String) -> void:
				_autotest_done())
	else:
		_autotest_done()
	if _spike_out != "":
		get_tree().create_timer(150.0).timeout.connect(func(): _quit_soon(0.5))

func _autotest_done() -> void:
	if _spike_out != "":
		_quit_soon(2.5)

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

# ── Stage, UI, evidence ──

func _build_stage() -> void:
	_rig = CameraRig.new()
	_rig.reduced_motion = _reduced_motion
	add_child(_rig)

	_sun = DirectionalLight3D.new()
	_sun.rotation_degrees = Vector3(-52, -30, 0)
	_sun.light_energy = 0.65
	_sun.shadow_enabled = true
	add_child(_sun)

	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.015, 0.025, 0.05)
	env.glow_enabled = true
	env.glow_intensity = 0.9
	env.glow_bloom = 0.12
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.25, 0.32, 0.5)
	env.ambient_light_energy = 0.5
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	var ground := MeshInstance3D.new()
	var gmesh := PlaneMesh.new()
	gmesh.size = Vector2(240, 240)
	var gmat := StandardMaterial3D.new()
	gmat.albedo_color = Color(0.02, 0.03, 0.06)
	gmat.metallic = 0.1
	gmat.roughness = 0.85
	gmesh.material = gmat
	ground.mesh = gmesh
	ground.position = Vector3(0, -0.42, 0)
	add_child(ground)

	_city = CityBuilder.new()
	_city.reduced_motion = _reduced_motion
	add_child(_city)

	_avatar = AgentAvatar.new()
	_avatar.reduced_motion = _reduced_motion
	add_child(_avatar)

	var canvas := CanvasLayer.new()
	add_child(canvas)
	var panel := PanelContainer.new()
	panel.anchor_left = 0.0
	panel.anchor_top = 0.66
	panel.anchor_right = 0.32
	panel.anchor_bottom = 1.0
	canvas.add_child(panel)
	_log_label = RichTextLabel.new()
	_log_label.bbcode_enabled = true
	_log_label.scroll_following = true
	panel.add_child(_log_label)
	_fps_label = Label.new()
	_fps_label.position = Vector2(12, 8)
	canvas.add_child(_fps_label)

	_living = LivingLayer.new()
	_living.reduced_motion = _reduced_motion
	add_child(_living)
	_living.build_hud(canvas, self)
	_living.attach_city(_city)

	_bench = Workbench.new()
	add_child(_bench)
	_bench.dispatch_requested.connect(_dispatch_run)
	_bench.toggle_city_requested.connect(func(): _bench.set_work_visible(not _bench.is_work_visible()))
	_bench.approval_decided.connect(func(run_id: String, approved: bool):
		_call_rpc("agent.approve" if approved else "agent.reject", [run_id], func(_r: Variant) -> void:
			_log("approval verdict sent · %s" % ("approved" if approved else "rejected"))))
	_bench.commit_requested.connect(_on_commit_requested)
	_bench.open_workspace_requested.connect(_on_open_workspace)
	_bench.retry_requested.connect(_on_retry)

func _on_commit_requested(message: String) -> void:
	if message.strip_edges() == "" or _workspace_id == "":
		_log("[color=yellow]commit skipped: empty message or no workspace[/color]")
		return
	_call_rpc("git.commit", [_workspace_id, { "message": message, "addAll": true }], _on_commit_result)

func _on_commit_result(result: Variant) -> void:
	if result is Dictionary and (result as Dictionary).get("ok", false):
		_log("[color=green]committed · %s[/color]" % String((result as Dictionary).get("commitHash", "")).substr(0, 8))
		_load_snapshot(_workspace_id)
		return
	var emsg := "commit failed"
	if result is Dictionary:
		var err: Variant = (result as Dictionary).get("error")
		if err is Dictionary:
			emsg = String((err as Dictionary).get("message", emsg))
	_log("[color=red]%s[/color]" % emsg)

func _on_open_workspace(dir: String) -> void:
	_call_rpc("workspace.registerPath", [dir],
		func(ws: Variant) -> void:
			if ws is Dictionary:
				_bench.hide_error()
				_load_snapshot(String((ws as Dictionary).get("id", ""))),
		func(emsg: String) -> void:
			_bench.show_error("WORKSPACE REGISTRATION FAILED", emsg))

func _on_retry() -> void:
	if _workspace_id != "":
		_load_snapshot(_workspace_id)

func _log(line: String) -> void:
	var plain := line
	for tag in ["[color=red]", "[color=green]", "[color=cyan]", "[color=yellow]", "[/color]"]:
		plain = plain.replace(tag, "")
	print("[city] " + plain)
	if _log_label:
		_log_label.append_text(line + "\n")

func _shot_after(name: String, delay: float) -> void:
	if _spike_out == "" or _shots_taken.has(name):
		return
	await get_tree().create_timer(delay).timeout
	_shot(name)

func _shot(name: String) -> void:
	if _spike_out == "" or _shots_taken.has(name):
		return
	_shots_taken[name] = true
	# Wait for a fresh draw but never hang: macOS pauses drawing for occluded
	# windows while processing continues, so frame_post_draw may never fire.
	var drawn := [false]
	RenderingServer.frame_post_draw.connect(func(): drawn[0] = true, CONNECT_ONE_SHOT)
	var waited := 0.0
	while not drawn[0] and waited < 1.5:
		await get_tree().process_frame
		waited += get_process_delta_time()
	var img := get_viewport().get_texture().get_image()
	var out := _spike_out.path_join(name + ".png")
	img.save_png(out)
	_log("screenshot → " + out)

func _quit_soon(delay: float) -> void:
	if _quitting:
		return
	_quitting = true
	await get_tree().create_timer(delay).timeout
	_log("fps after warmup: %d" % Engine.get_frames_per_second())
	await _shot("city-99-final")
	if _core_pid > 0:
		OS.kill(_core_pid)
	get_tree().quit()
