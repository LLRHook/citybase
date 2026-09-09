extends SceneTree
# Real loopback RPC regression; the Node driver starts the protocol server.
var received := false
var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, description: String) -> void:
	print(("PASS " if condition else "FAIL ") + description)
	if not condition:
		failures += 1

func wait_for(predicate: Callable) -> bool:
	var deadline := Time.get_ticks_msec() + 5000
	while not predicate.call() and Time.get_ticks_msec() < deadline:
		await process_frame
	return predicate.call()

func _run() -> void:
	var main = load("res://tests/transport_main.gd").new()
	root.add_child(main)
	main._core_port = int(OS.get_environment("CITYBASE_TEST_PORT"))
	main._token = OS.get_environment("CITYBASE_TEST_TOKEN")
	main._connect_ws()
	check(await wait_for(func(): return main._ws_connected), "initial real WebSocket connection")
	for attempt in 2:
		if attempt == 1:
			# This is the same peer creation path used by Retry; no request is
			# replayed when the closed peer is replaced.
			main._connect_ws()
			check(await wait_for(func(): return main._ws_connected), "replacement real WebSocket connection")
		received = false
		main._call_rpc("transport.probe", [], func(result: Variant) -> void:
			received = result is Dictionary and result.get("marker") == "complete" and String(result.get("content", "")).length() == 131072)
		check(await wait_for(func(): return received or main._connection_failed) and received, "128 KiB RPC received on peer %d" % attempt)
		if attempt == 0:
			var incorrectly_resolved := [false]
			main._call_rpc("transport.oversize", [], func(_result: Variant): incorrectly_resolved[0] = true, func(_error: String): incorrectly_resolved[0] = true)
			check(await wait_for(func(): return main._connection_failed), "oversize response visibly loses connection")
			check(main._ws.get_close_code() == 1009 and main._pending.is_empty() and not incorrectly_resolved[0], "1009 preserves unknown pending-action outcome")
			check(main._bench._error_panel.visible, "disconnect error panel is visible")
			await create_timer(0.1).timeout
			check(not main._ws_connected, "no automatic request replay or reconnection")
	var falsely_failed := [false]
	main._call_rpc("transport.neverSent", ["x".repeat(2 * 1024 * 1024)], func(_result: Variant): falsely_failed[0] = true, func(_error: String): falsely_failed[0] = true)
	check(main._connection_failed and not falsely_failed[0], "local send failure leaves action outcome unknown")
	await create_timer(0.1).timeout
	check(not main._ws_connected and main._ws.get_ready_state() != WebSocketPeer.STATE_OPEN, "local send failure cannot reopen itself next frame")
	main._connect_ws()
	check(await wait_for(func(): return main._ws_connected), "explicit reconnection after local send failure")
	main._call_rpc("transport.disconnect", [], func(_result: Variant): pass)
	check(await wait_for(func(): return main._connection_failed), "server disconnect is surfaced")
	check(main._ws.get_close_code() == 1011 and main._bench._error_panel.visible, "server close code is preserved")
	print("TRANSPORT_FAILURES=%d" % failures)
	main._ws.close()
	main.free()
	quit(0 if failures == 0 else 1)
