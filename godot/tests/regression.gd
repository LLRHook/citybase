extends SceneTree
# Run: godot --headless --path godot --script res://tests/regression.gd
# Formula fixtures below are regression checks, never live-run evidence.
const MainHarness = preload("res://tests/main_harness.gd")
var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, description: String) -> void:
	print(("PASS " if condition else "FAIL ") + description)
	if not condition:
		failures += 1

func _run() -> void:
	var main = MainHarness.new()
	root.add_child(main)
	var original_override := OS.get_environment("CITYBASE_NODE")
	OS.set_environment("CITYBASE_NODE", OS.get_executable_path())
	check(main._find_node() == OS.get_executable_path(), "explicit executable override")
	OS.set_environment("CITYBASE_NODE", "missing-citybase-node-executable")
	check(main._find_node() == "", "invalid explicit executable fails clearly")
	OS.set_environment("CITYBASE_NODE", "")
	var node: String = main._find_node()
	check(FileAccess.file_exists(node), "Node discovery from this host's PATH")
	OS.set_environment("CITYBASE_NODE", original_override)
	main._on_retry()
	check(main.startup_attempts == 1 and main.connection_attempts == 1, "Retry restarts a failed core and reconnects")
	var action_failed := [false]
	main._pending[99] = {"err": func(_message: String): action_failed[0] = true}
	main._connection_lost("fixture lost acknowledgement")
	check(main._connection_failed and main._pending.is_empty() and not action_failed[0] and main._core_port == 43210, "disconnect preserves core and does not misreport pending action outcome")
	main._run_id = "fixture-run"
	main._bench.run_started(main._run_id)
	main._refresh_runs()
	main.respond("agent.listRuns", [{"runId": "fixture-run", "status": "done"}])
	check(not main._bench._run_button.disabled and main._bench._status_label.text == "run settled · done", "history reconciles a run that settled while disconnected")
	main._run_id = ""
	main._repo_root = "C:/Projects/Citybase"
	main._last_snapshot = {"rootPath": "D:/Game Projects/Minecraft"}
	check(main._touched_path({"payload": {"path": "D:\\Game Projects\\Minecraft\\src\\world.js"}}) == "src/world.js", "external workspace tool path uses selected snapshot root")
	main._last_snapshot = {"rootPath": "C:/Projects/Citybase/build/minecraft-trial"}
	check(main._touched_path({"payload": {"file_path": "C:/Projects/Citybase/build/minecraft-trial/src/world.js"}}) == "src/world.js", "nested workspace path excludes Citybase host prefix")
	main._last_snapshot = {"rootPath": "D:/Game Projects/Minecraft/"}
	check(main._touched_path({"payload": {"file": "D:/Game Projects/Minecraft/src/world.js"}}) == "src/world.js", "workspace root trailing slash")
	check(main._touched_path({"payload": {"paths": ["D:/Game Projects/Minecraft-other/src/world.js"]}}) == "D:/Game Projects/Minecraft-other/src/world.js", "prefix-neighbor directory is not selected workspace")
	check(main._touched_path({"payload": {"path": "src\\World.js"}}) == "src/World.js", "relative paths stay relative and retain filename case")
	if OS.get_name() == "Windows":
		check(main._touched_path({"payload": {"path": "d:/GAME PROJECTS/minecraft/src/World.js"}}) == "src/World.js", "Windows root comparison ignores case and preserves filename case")

	for sample in [[], [{"status": "cancelled"}], [{"status": "awaiting-approval"}], [{"status": "running"}]]:
		main._living.update_snapshot({}, sample)
		var text: String = main._living._vitals_label.get_parsed_text()
		check(text.contains("success unavailable") and text.contains("0 completed"), "no success percentage without completed outcomes: " + str(sample))
	main._living.update_snapshot({}, [{"status": "done"}, {"status": "failed"}, {"status": "cancelled"}])
	check(main._living._vitals_label.get_parsed_text().contains("50%") and main._living._vitals_label.get_parsed_text().contains("2 completed"), "success uses done plus failed only, excluding cancellation")

	var fixture_tree: Array = ["README.md"]
	for district in ["src", "docs", "assets"]:
		for index in 7:
			fixture_tree.append("%s/file-%d.js" % [district, index])
	main._city.build({"repoTree": fixture_tree})
	main._rig.frame_points(main._city.framing_points())
	var all_in_view := true
	var viewport_size := root.get_visible_rect().size
	for child in main._city.get_children():
		if child is MeshInstance3D and not child.is_queued_for_deletion():
			for corner in 8:
				var point: Vector3 = child.transform * child.get_aabb().get_endpoint(corner)
				var projected: Vector2 = main._rig._camera.unproject_position(point)
				all_in_view = all_in_view and Rect2(Vector2.ZERO, viewport_size).has_point(projected)
	check(all_in_view, "default small-city camera contains every platform and building corner")

	for row in [[0,0,0,0,1], [1,0,0,25,1], [2,0,0,50,2], [8,0,0,200,3], [18,0,0,450,4], [32,0,0,800,5], [50,0,0,1250,6], [0,1,0,5,1], [0,0,1,2,1], [1,1,1,32,1]]:
		var runs: Array = []
		for i in row[0]: runs.append({"status": "done"})
		for i in row[1]: runs.append({"status": "failed"})
		for i in row[2]: runs.append({"status": "cancelled"})
		main._living.update_snapshot({}, runs, {"xp": row[3]})
		var text: String = main._living._vitals_label.get_parsed_text()
		check(text.contains("LV %d" % row[4]) and text.contains("%d recorded xp" % row[3]), "formula: %d done / %d failed / %d cancelled = LV %d, %d XP" % [row[0], row[1], row[2], row[4], row[3]])

	for history_first in [true, false]:
		main._workspace_id = "fixture-workspace"
		main._last_snapshot = {"repoTree": ["before.js"], "files": []}
		main._last_runs = []
		main._last_progression = {}
		main._living.update_snapshot(main._last_snapshot, [])
		main._on_run_settled("done")
		var runs := [{"status": "done"}, {"status": "done"}]
		var snapshot := {"repoTree": ["a.js", "b.js", "c.js"], "files": [{"path": "a.js"}]}
		if history_first:
			main.respond("agent.listRuns", runs)
			main.respond("agent.getProgression", {"xp": 50})
			main.respond("git.getSnapshot", snapshot)
		else:
			main.respond("git.getSnapshot", snapshot)
			main.respond("agent.listRuns", runs)
			main.respond("agent.getProgression", {"xp": 50})
		var text: String = main._living._vitals_label.get_parsed_text()
		check(text.contains("LV 2") and text.contains("50 recorded xp") and text.contains("3 files · 1 dirty"), "settlement refreshes XP and snapshot in response order " + str(history_first))
	main._last_progression = {}
	main._refresh_runs()
	main.respond("agent.getProgression", {"xp": 5000})
	main.respond("agent.listRuns", [{"status": "failed"}])
	check(main._living._vitals_label.get_parsed_text().contains("5000 recorded xp"), "HUD uses the durable aggregate rather than recent outcomes")
	main._refresh_runs()
	main.respond("agent.getProgression", {"xp": 25})
	check(main._last_progression.xp == 5000, "late progression response cannot lower the displayed level")
	main._living.update_snapshot({}, [{"status": "done"}])
	check(main._living._vitals_label.get_parsed_text().contains("XP unavailable"), "missing aggregate does not silently substitute recent-window XP")
	main._living.update_snapshot({}, [{"status": "failed"}, {"status": "cancelled"}])
	check(main._living._vitals_label.get_parsed_text().contains("0% success") and main._living._vitals_label.get_parsed_text().contains("1 completed"), "only failed completions yield zero percent, not unavailable")
	main._living.update_snapshot({}, [{"status": "done"}, {"status": "cancelled"}, {"status": "cancelled"}])
	check(main._living._vitals_label.get_parsed_text().contains("100% success") and main._living._vitals_label.get_parsed_text().contains("1 completed / 3 recent runs"), "a positive success rate states its completed and recent sample scope")

	for district_count in [1, 4, 14]:
		var viewport := SubViewport.new()
		root.add_child(viewport)
		var city := preload("res://city_builder.gd").new()
		city.reduced_motion = true
		viewport.add_child(city)
		var rig := preload("res://camera_rig.gd").new()
		viewport.add_child(rig)
		var paths: Array = []
		var sizes := {}
		for district in district_count:
			for index in 12:
				var path := "district-%d/file-%d.js" % [district, index]
				paths.append(path)
				sizes[path] = 100000
		city.build({"repoTree": paths, "fileSizes": sizes})
		for size in [Vector2i(1480, 960), Vector2i(960, 640), Vector2i(640, 960)]:
			viewport.size = size
			await process_frame
			rig.frame_points(city.framing_points())
			var safe_rect := Rect2(Vector2(size) * Vector2(0.04, 0.16), Vector2(size) * Vector2(0.92, 0.44))
			var contained := true
			for child in city.get_children():
				if child is MeshInstance3D:
					for corner in 8:
						var point: Vector3 = child.transform * child.get_aabb().get_endpoint(corner)
						contained = contained and not rig._camera.is_position_behind(point) and safe_rect.has_point(rig._camera.unproject_position(point))
			check(contained, "HUD-free perspective framing: %d districts at %s" % [district_count, size])
		viewport.queue_free()
	main._load_snapshot("fixture-workspace")
	main.respond_error("git.getSnapshot", "Rust snapshot processor missing")
	check(main._bench._error_panel.visible and main._bench._error_text.get_parsed_text().contains("Rust snapshot processor missing"), "native processor errors appear in the workbench instead of a fake city")
	print("REGRESSION_FAILURES=%d" % failures)
	quit(1 if failures > 0 else 0)
