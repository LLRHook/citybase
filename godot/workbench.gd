extends CanvasLayer
# Workbench — the in-engine work surface (FEAT-025, v4 Phase D).
#
# Pure UI: renders quest board / run form / live run / outcome / approval
# modal / commit bar / error surface, and emits signals up to main.gd, which
# owns the RPC client. State flows in through set_* / show_* methods.

signal dispatch_requested(prompt: String)
signal approval_decided(run_id: String, approved: bool)
signal commit_requested(message: String)
signal open_workspace_requested(path: String)
signal retry_requested
signal toggle_city_requested

const INK := Color(0.91, 0.93, 1.0)
const INK_DIM := Color(0.55, 0.6, 0.78)
const CYAN := Color(0.36, 0.83, 1.0)
const GREEN := Color(0.37, 0.89, 0.6)
const AMBER := Color(1.0, 0.72, 0.29)
const RED := Color(1.0, 0.42, 0.54)
const BG := Color(0.05, 0.07, 0.12, 0.92)

var _top_label: Label
var _quest_list: ItemList
var _runs_list: ItemList
var _prompt: TextEdit
var _run_button: Button
var _events: RichTextLabel
var _outcome: RichTextLabel
var _status_label: Label
var _commit_message: LineEdit
var _work_panel: Control
var _modal: Control
var _modal_text: RichTextLabel
var _modal_run_id := ""
var _error_panel: Control
var _error_text: RichTextLabel
var _file_dialog: FileDialog
var _quests: Array = []

func _ready() -> void:
	layer = 10
	_build_top_bar()
	_build_work_panel()
	_build_modal()
	_build_error_panel()
	_build_file_dialog()

# ── state in ──

func set_workspace(name: String, branch: String, dirty: int) -> void:
	_top_label.text = "  %s · %s · %d dirty" % [name, branch, dirty] if name != "" else "  no workspace"

func set_quests(quests: Array) -> void:
	_quests = quests
	_quest_list.clear()
	for q_variant in quests:
		var q: Dictionary = q_variant
		var idx := _quest_list.add_item("[%s] %s · %s" % [q.get("priority", "?"), q.get("id", "?"), q.get("title", "")])
		_quest_list.set_item_custom_fg_color(idx, RED if q.get("kind") == "bug" else CYAN)
		_quest_list.set_item_tooltip(idx, String(q.get("summary", "")))

func set_runs(runs: Array) -> void:
	_runs_list.clear()
	for r_variant in runs:
		var r: Dictionary = r_variant
		var status := String(r.get("status", "?"))
		var idx := _runs_list.add_item("%s · %s · %s" % [status, String(r.get("provider", "?")), String(r.get("runId", "")).substr(0, 8)])
		var color := GREEN if status == "done" else (RED if status == "failed" else (AMBER if status == "running" else INK_DIM))
		_runs_list.set_item_custom_fg_color(idx, color)

func run_started(run_id: String) -> void:
	_status_label.text = "run %s · running" % run_id.substr(0, 8)
	_status_label.add_theme_color_override("font_color", AMBER)
	_run_button.disabled = true
	_events.clear()
	_outcome.clear()
	_outcome.append_text("[color=#8b93c0]outcome renders when the run settles…[/color]")

func append_event(kind: String, text: String) -> void:
	var color := "#ff6b8a" if kind == "error" else "#5dd4ff"
	_events.append_text("[color=%s]%s[/color] %s\n" % [color, kind, text.substr(0, 160)])

func run_settled(status: String) -> void:
	_status_label.text = "run settled · " + status
	_status_label.add_theme_color_override("font_color", GREEN if status == "done" else RED)
	_run_button.disabled = false

func show_outcome(diff: Dictionary, checks: Array) -> void:
	_outcome.clear()
	var files: Array = diff.get("files", [])
	var additions := 0
	var deletions := 0
	var districts := {}
	for f_variant in files:
		var f: Dictionary = f_variant
		additions += int(f.get("additions", 0))
		deletions += int(f.get("deletions", 0))
		var p := String(f.get("file", ""))
		var slash := p.find("/")
		var d := "core" if slash == -1 else p.substr(0, slash)
		if not districts.has(d):
			districts[d] = []
		(districts[d] as Array).append(f)
	var risk := _assess_risk(files, additions + deletions, districts.size(), checks)
	var risk_color: String = {"low": "#5fe39a", "medium": "#ffb84a", "high": "#ff6b8a"}[risk]
	_outcome.append_text("[b]OUTCOME[/b]   [color=%s]risk · %s[/color]   %d file%s · +%d / -%d · %d district%s\n\n" % [
		risk_color, risk, files.size(), "" if files.size() == 1 else "s",
		additions, deletions, districts.size(), "" if districts.size() == 1 else "s",
	])
	if files.is_empty():
		_outcome.append_text("[color=#8b93c0]no file changes[/color]\n")
	for d in districts.keys():
		_outcome.append_text("[color=#5dd4ff]◍ %s[/color]\n" % d)
		for f_variant in districts[d]:
			var f: Dictionary = f_variant
			_outcome.append_text("   %s %s  [color=#8b93c0]+%d/-%d[/color]\n" % [
				String(f.get("kind", "?")), String(f.get("file", "")), int(f.get("additions", 0)), int(f.get("deletions", 0)),
			])
	if not checks.is_empty():
		_outcome.append_text("\n[b]CHECKS[/b]\n")
		for c_variant in checks:
			var c: Dictionary = c_variant
			var state := String(c.get("state", "?"))
			var cc := "#5fe39a" if state == "pass" else ("#ffb84a" if state == "warn" else "#ff6b8a")
			_outcome.append_text("   [color=%s]%s[/color] %s\n" % [cc, state, String(c.get("name", ""))])

func show_approval(run_id: String, summary: Dictionary) -> void:
	_modal_run_id = run_id
	_modal_text.clear()
	_modal_text.append_text("[b]APPROVE AGENT RUN?[/b]\n\n")
	_modal_text.append_text("skill: %s · branch: %s\n\n" % [String(summary.get("skill", "?")), String(summary.get("branch", "?"))])
	_modal_text.append_text("[color=#e8ecff]%s[/color]" % String(summary.get("text", "")))
	_modal.visible = true

func show_error(kind: String, message: String) -> void:
	_error_text.clear()
	_error_text.append_text("[b][color=#ff6b8a]%s[/color][/b]\n\n%s\n\n" % [kind, message])
	_error_text.append_text("[color=#8b93c0]Retry, or open a different workspace.[/color]")
	_error_panel.visible = true

func hide_error() -> void:
	_error_panel.visible = false

func set_work_visible(on: bool) -> void:
	_work_panel.visible = on

func is_work_visible() -> bool:
	return _work_panel.visible

func prompt_text() -> String:
	return _prompt.text

# ── UI construction ──

func _build_top_bar() -> void:
	var bar := PanelContainer.new()
	bar.anchor_right = 1.0
	bar.custom_minimum_size = Vector2(0, 40)
	bar.add_theme_stylebox_override("panel", _flat_style(BG))
	add_child(bar)
	var row := HBoxContainer.new()
	bar.add_child(row)
	var title := Label.new()
	title.text = "  CITYBASE v4"
	title.add_theme_color_override("font_color", CYAN)
	row.add_child(title)
	_top_label = Label.new()
	_top_label.text = "  no workspace"
	_top_label.add_theme_color_override("font_color", INK_DIM)
	_top_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_top_label)
	row.add_child(_button("OPEN WORKSPACE", func(): _file_dialog.popup_centered_ratio(0.7)))
	row.add_child(_button("CITY / WORK", func(): toggle_city_requested.emit()))

func _build_work_panel() -> void:
	_work_panel = PanelContainer.new()
	_work_panel.anchor_top = 0.06
	_work_panel.anchor_right = 1.0
	_work_panel.anchor_bottom = 1.0
	(_work_panel as PanelContainer).add_theme_stylebox_override("panel", _flat_style(Color(0.03, 0.045, 0.085, 0.94)))
	add_child(_work_panel)

	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 14)
	_work_panel.add_child(columns)

	# Left: quests + runs
	var left := VBoxContainer.new()
	left.custom_minimum_size = Vector2(430, 0)
	columns.add_child(left)
	left.add_child(_section_label("QUEST BOARD · from features.md / bugs.md"))
	_quest_list = ItemList.new()
	_quest_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_quest_list.item_selected.connect(_on_quest_selected)
	left.add_child(_quest_list)
	left.add_child(_section_label("RUN HISTORY"))
	_runs_list = ItemList.new()
	_runs_list.custom_minimum_size = Vector2(0, 170)
	left.add_child(_runs_list)

	# Right: prompt, live activity, outcome, commit
	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_child(right)
	right.add_child(_section_label("PROMPT · claude"))
	_prompt = TextEdit.new()
	_prompt.custom_minimum_size = Vector2(0, 84)
	_prompt.placeholder_text = "e.g. fix the lint warnings in src/ — dispatched behind the approval gate"
	right.add_child(_prompt)
	var run_row := HBoxContainer.new()
	right.add_child(run_row)
	_run_button = _button("▶ RUN (gated)", func(): dispatch_requested.emit(_prompt.text))
	run_row.add_child(_run_button)
	_status_label = Label.new()
	_status_label.text = "idle"
	_status_label.add_theme_color_override("font_color", INK_DIM)
	run_row.add_child(_status_label)
	right.add_child(_section_label("LIVE ACTIVITY"))
	_events = RichTextLabel.new()
	_events.bbcode_enabled = true
	_events.scroll_following = true
	_events.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(_events)
	right.add_child(_section_label("OUTCOME · changed districts · checks"))
	_outcome = RichTextLabel.new()
	_outcome.bbcode_enabled = true
	_outcome.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(_outcome)
	var commit_row := HBoxContainer.new()
	right.add_child(commit_row)
	_commit_message = LineEdit.new()
	_commit_message.placeholder_text = "commit message (conventional format)"
	_commit_message.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	commit_row.add_child(_commit_message)
	commit_row.add_child(_button("✓ COMMIT", func(): commit_requested.emit(_commit_message.text)))

	_work_panel.visible = false

func _build_modal() -> void:
	_modal = _overlay()
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(560, 240)
	panel.add_theme_stylebox_override("panel", _flat_style(Color(0.07, 0.09, 0.16, 0.98), AMBER))
	_modal.add_child(panel)
	var box := VBoxContainer.new()
	panel.add_child(box)
	_modal_text = RichTextLabel.new()
	_modal_text.bbcode_enabled = true
	_modal_text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(_modal_text)
	var buttons := HBoxContainer.new()
	buttons.alignment = BoxContainer.ALIGNMENT_CENTER
	buttons.add_theme_constant_override("separation", 16)
	box.add_child(buttons)
	buttons.add_child(_button("✓ APPROVE", func(): _decide(true)))
	buttons.add_child(_button("✕ REJECT", func(): _decide(false)))

func _decide(approved: bool) -> void:
	if _modal_run_id == "":
		return
	var rid := _modal_run_id
	_modal_run_id = ""
	_modal.visible = false
	approval_decided.emit(rid, approved)

func _build_error_panel() -> void:
	_error_panel = _overlay()
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(560, 220)
	panel.add_theme_stylebox_override("panel", _flat_style(Color(0.1, 0.05, 0.08, 0.98), RED))
	_error_panel.add_child(panel)
	var box := VBoxContainer.new()
	panel.add_child(box)
	_error_text = RichTextLabel.new()
	_error_text.bbcode_enabled = true
	_error_text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(_error_text)
	var buttons := HBoxContainer.new()
	buttons.alignment = BoxContainer.ALIGNMENT_CENTER
	buttons.add_theme_constant_override("separation", 16)
	box.add_child(buttons)
	buttons.add_child(_button("↻ RETRY", _on_retry_pressed))
	buttons.add_child(_button("＋ OPEN WORKSPACE", func(): _file_dialog.popup_centered_ratio(0.7)))

func _on_retry_pressed() -> void:
	_error_panel.visible = false
	retry_requested.emit()

func _build_file_dialog() -> void:
	_file_dialog = FileDialog.new()
	_file_dialog.access = FileDialog.ACCESS_FILESYSTEM
	_file_dialog.file_mode = FileDialog.FILE_MODE_OPEN_DIR
	_file_dialog.title = "Open Workspace (a local Git repository)"
	_file_dialog.dir_selected.connect(func(dir: String): open_workspace_requested.emit(dir))
	add_child(_file_dialog)

func _on_quest_selected(index: int) -> void:
	if index < 0 or index >= _quests.size():
		return
	var q: Dictionary = _quests[index]
	_prompt.text = "Work the tracker ticket %s (%s): %s. Follow the ticket's approach and acceptance criteria in %s." % [
		q.get("id"), q.get("title"), q.get("summary"),
		"bugs.md" if q.get("kind") == "bug" else "features.md",
	]

func _assess_risk(files: Array, churn: int, district_count: int, checks: Array) -> String:
	for c_variant in checks:
		if String((c_variant as Dictionary).get("state", "")) == "fail":
			return "high"
	if files.size() > 8 or churn > 400:
		return "high"
	for f_variant in files:
		if String((f_variant as Dictionary).get("kind", "")) == "delete":
			return "medium"
	if files.size() > 3 or churn > 120 or district_count > 3:
		return "medium"
	return "low"

# ── widgets ──

func _overlay() -> Control:
	var overlay := Control.new()
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.visible = false
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(dim)
	add_child(overlay)
	return overlay

func _button(text: String, on_pressed: Callable) -> Button:
	var b := Button.new()
	b.text = " %s " % text
	b.pressed.connect(on_pressed)
	return b

func _section_label(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_color_override("font_color", INK_DIM)
	l.add_theme_font_size_override("font_size", 12)
	return l

func _flat_style(bg: Color, border: Color = Color(0.2, 0.3, 0.5, 0.5)) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(1)
	s.set_content_margin_all(10)
	return s
