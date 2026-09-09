extends "res://main.gd"
# Test-only transport: queue real main.gd callbacks so both response orders can
# be exercised without dispatching an agent or changing a user's run history.
var requests: Array = []
var startup_attempts := 0
var connection_attempts := 0

func _ready() -> void:
	_reduced_motion = true
	_build_stage()

func _call_rpc(method: String, params: Array, on_result: Callable, on_error: Callable = Callable()) -> void:
	requests.append({"method": method, "params": params, "ok": on_result, "err": on_error})

func _spawn_core() -> void:
	startup_attempts += 1
	_core_port = 43210

func _connect_ws() -> void:
	connection_attempts += 1

func respond(method: String, result: Variant) -> void:
	for index in requests.size():
		if requests[index]["method"] == method:
			var callback: Callable = requests[index]["ok"]
			requests.remove_at(index)
			callback.call(result)
			return
	assert(false, "No pending request for " + method)
