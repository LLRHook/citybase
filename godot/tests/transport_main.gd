extends "res://main.gd"
# Use the production transport and UI without spawning a core or an agent.
func _ready() -> void:
	_reduced_motion = true
	_build_stage()
