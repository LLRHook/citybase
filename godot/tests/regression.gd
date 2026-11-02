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

	for row in [[0,0,0,0,1], [1,0,0,25,1], [2,0,0,50,2], [8,0,0,200,3], [18,0,0,450,4], [32,0,0,800,5], [50,0,0,1250,6], [0,1,0,5,1], [0,0,1,2,1], [1,1,1,32,1]]:
		var runs: Array = []
		for i in row[0]: runs.append({"status": "done"})
		for i in row[1]: runs.append({"status": "failed"})
		for i in row[2]: runs.append({"status": "cancelled"})
		main._living.update_snapshot({}, runs)
		var text: String = main._living._vitals_label.get_parsed_text()
		check(text.contains("LV %d" % row[4]) and text.contains("%d xp" % row[3]), "formula: %d done / %d failed / %d cancelled = LV %d, %d XP" % [row[0], row[1], row[2], row[4], row[3]])

	for history_first in [true, false]:
		main._workspace_id = "fixture-workspace"
		main._last_snapshot = {"repoTree": ["before.js"], "files": []}
		main._last_runs = []
		main._living.update_snapshot(main._last_snapshot, [])
		main._on_run_settled("done")
		var runs := [{"status": "done"}, {"status": "done"}]
		var snapshot := {"repoTree": ["a.js", "b.js", "c.js"], "files": [{"path": "a.js"}]}
		if history_first:
			main.respond("agent.listRuns", runs)
			main.respond("git.getSnapshot", snapshot)
		else:
			main.respond("git.getSnapshot", snapshot)
			main.respond("agent.listRuns", runs)
		var text: String = main._living._vitals_label.get_parsed_text()
		check(text.contains("LV 2") and text.contains("50 xp") and text.contains("3 files · 1 dirty"), "settlement refreshes XP and snapshot in response order " + str(history_first))
	print("REGRESSION_FAILURES=%d" % failures)
	quit(1 if failures > 0 else 0)
