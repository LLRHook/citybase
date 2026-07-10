extends Node
# LivingLayer — the ambient/vitals systems (FEAT-026, v4 Phase E).
#
# Every number on screen traces to a real source:
#   velocity      — commits/day from the snapshot's recentCommits timestamps
#   dirty/files   — the live snapshot
#   runs + rate   — agentManager's persisted run history
#   XP / level    — derived from that same history (done 25 · failed 5 · cancelled 2)
#   activity feed — real commits + live run lifecycle events, merged
# Ambient city life (building window flicker, drifting motes between
# districts) is decorative but driven by the real building set; everything
# animated respects reduced_motion.

const CYAN := Color(0.36, 0.83, 1.0)
const GREEN := Color(0.37, 0.89, 0.6)
const AMBER := Color(1.0, 0.72, 0.29)
const INK_DIM := Color(0.55, 0.6, 0.78)

var reduced_motion := false

var _city: Node3D = null            # CityBuilder, for ambient targets
var _world: Node3D = null           # parent for 3D ambient nodes
var _vitals_label: RichTextLabel
var _feed: RichTextLabel
var _feed_lines: Array = []
var _flicker_timer: Timer
var _mote_timer: Timer
var _motes := 0

func build_hud(canvas: CanvasLayer, world: Node3D) -> void:
	_world = world
	var vitals_panel := PanelContainer.new()
	vitals_panel.anchor_left = 0.58
	vitals_panel.anchor_right = 1.0
	vitals_panel.anchor_top = 0.052
	vitals_panel.custom_minimum_size = Vector2(0, 40)
	canvas.add_child(vitals_panel)
	_vitals_label = RichTextLabel.new()
	_vitals_label.bbcode_enabled = true
	_vitals_label.fit_content = true
	vitals_panel.add_child(_vitals_label)

	var feed_panel := PanelContainer.new()
	feed_panel.anchor_left = 0.70
	feed_panel.anchor_right = 1.0
	feed_panel.anchor_top = 0.62
	feed_panel.anchor_bottom = 1.0
	canvas.add_child(feed_panel)
	var feed_box := VBoxContainer.new()
	feed_panel.add_child(feed_box)
	var feed_title := Label.new()
	feed_title.text = "ACTIVITY"
	feed_title.add_theme_color_override("font_color", INK_DIM)
	feed_title.add_theme_font_size_override("font_size", 12)
	feed_box.add_child(feed_title)
	_feed = RichTextLabel.new()
	_feed.bbcode_enabled = true
	_feed.scroll_following = false
	_feed.size_flags_vertical = Control.SIZE_EXPAND_FILL
	feed_box.add_child(_feed)

	_flicker_timer = Timer.new()
	_flicker_timer.wait_time = 1.4
	_flicker_timer.timeout.connect(_flicker_random_building)
	add_child(_flicker_timer)
	_mote_timer = Timer.new()
	_mote_timer.wait_time = 2.6
	_mote_timer.timeout.connect(_spawn_mote)
	add_child(_mote_timer)
	if not reduced_motion:
		_flicker_timer.start()
		_mote_timer.start()

func attach_city(city: Node3D) -> void:
	_city = city

# ── vitals + XP (all real data) ──

func update_snapshot(snap: Dictionary, runs: Array) -> void:
	var commits: Array = snap.get("recentCommits", [])
	var velocity := _commits_per_day(commits)
	var dirty := (snap.get("files", []) as Array).size()
	var tracked := (snap.get("repoTree", []) as Array).size()
	var done := 0
	var failed := 0
	var cancelled := 0
	for r_variant in runs:
		match String((r_variant as Dictionary).get("status", "")):
			"done": done += 1
			"failed": failed += 1
			"cancelled": cancelled += 1
	var total := done + failed
	var rate := int(round(100.0 * done / total)) if total > 0 else 100
	var xp := done * 25 + failed * 5 + cancelled * 2
	var level := int(floor(sqrt(float(xp) / 50.0))) + 1

	_vitals_label.clear()
	_vitals_label.append_text(
		" [color=#5dd4ff]LV %d[/color] [color=#8b93c0]· %d xp[/color]   [color=#5fe39a]%d%%[/color] [color=#8b93c0]success · %d runs[/color]   [color=#ffb84a]%.1f[/color] [color=#8b93c0]commits/day[/color]   [color=#e8ecff]%d[/color] [color=#8b93c0]files · %d dirty[/color]" % [
			level, xp, rate, runs.size(), velocity, tracked, dirty,
		])

	for c_variant in commits.slice(0, 5):
		var c: Dictionary = c_variant
		_note("[color=#8b93c0]%s[/color] %s" % [String(c.get("hash", "")).substr(0, 7), String(c.get("title", ""))], String(c.get("hash", "")))

func note_run_event(kind: String, text: String) -> void:
	var color := "#ff6b8a" if kind == "error" else "#5dd4ff"
	_note("[color=%s]▸[/color] %s" % [color, text.substr(0, 90)], "")

# ── activity feed ──

func _note(line: String, dedup_key: String) -> void:
	if dedup_key != "" and _feed_lines.has(dedup_key):
		return
	if dedup_key != "":
		_feed_lines.append(dedup_key)
	if _feed == null:
		return
	_feed.append_text(line + "\n")

# ── ambient life ──

func _flicker_random_building() -> void:
	if _city == null or not _city.has_method("glow"):
		return
	var paths: Array = _city.call("building_paths")
	if paths.is_empty():
		return
	var path: String = paths[randi() % paths.size()]
	_city.call("glow", path, 1.4, 0.5)

func _spawn_mote() -> void:
	if _world == null or _city == null or _motes >= 6:
		return
	var centers: Array = _city.call("district_centers")
	if centers.size() < 2:
		return
	var from: Vector3 = centers[randi() % centers.size()]
	var to: Vector3 = centers[randi() % centers.size()]
	if from.is_equal_approx(to):
		return
	var mote := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.09
	mesh.height = 0.18
	var mat := StandardMaterial3D.new()
	mat.emission_enabled = true
	mat.emission = CYAN
	mat.emission_energy_multiplier = 2.0
	mesh.material = mat
	mote.mesh = mesh
	mote.position = from + Vector3(0, 0.35, 0)
	_world.add_child(mote)
	_motes += 1
	var travel := clampf(from.distance_to(to) / 6.0, 1.4, 4.0)
	var tween := mote.create_tween()
	tween.tween_property(mote, "position", to + Vector3(0, 0.35, 0), travel).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_callback(func():
		_motes -= 1
		mote.queue_free())

func _commits_per_day(commits: Array) -> float:
	if commits.size() < 2:
		return float(commits.size())
	var newest := _epoch(String((commits[0] as Dictionary).get("committedAt", "")))
	var oldest := _epoch(String((commits[commits.size() - 1] as Dictionary).get("committedAt", "")))
	var span_days := maxf((newest - oldest) / 86400.0, 0.04)
	return float(commits.size()) / span_days

func _epoch(iso: String) -> float:
	if iso == "":
		return 0.0
	return float(Time.get_unix_time_from_datetime_string(iso))
