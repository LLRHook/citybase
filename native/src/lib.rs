#![forbid(unsafe_code)]

use serde_json::{json, Map, Value};

pub const MAX_INPUT_BYTES: u64 = 128 * 1024 * 1024;

fn status_digit(ch: char) -> &'static str {
    match ch {
        '.' => "unmodified",
        'A' => "added",
        'D' => "deleted",
        'R' | 'C' => "renamed",
        'U' => "conflicted",
        '?' => "untracked",
        _ => "modified",
    }
}

fn file_entry(path: &str, xy: &str) -> Value {
    let mut chars = xy.chars();
    let x = chars.next().unwrap_or('.');
    let y = chars.next().unwrap_or('.');
    let status = if xy.chars().count() < 2 {
        "modified"
    } else if x == 'U' || y == 'U' {
        "conflicted"
    } else if x == 'A' || y == 'A' {
        "added"
    } else if x == 'D' || y == 'D' {
        "deleted"
    } else if x == 'R' || y == 'R' {
        "renamed"
    } else if x == 'M' || y == 'M' {
        "modified"
    } else {
        // Keep the legacy precedence, including a clean index and copied worktree.
        match x {
            '.' | 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' => status_digit(x),
            _ => status_digit(y),
        }
    };
    json!({
        "path": path, "status": status, "staged": x != '.', "unstaged": y != '.',
        "indexStatus": status_digit(x), "workTreeStatus": status_digit(y),
    })
}

fn parse_files(status: &str) -> Vec<Value> {
    let mut files = Vec::new();
    for line in status.split('\n') {
        if let Some(path) = line.strip_prefix("? ") {
            files.push(json!({"path":path,"status":"untracked","staged":false,
                "unstaged":true,"indexStatus":"unmodified","workTreeStatus":"untracked"}));
            continue;
        }
        let parts: Vec<_> = line.split(' ').collect();
        let tail = |offset| {
            parts
                .iter()
                .skip(offset)
                .copied()
                .collect::<Vec<_>>()
                .join(" ")
        };
        if line.starts_with("1 ") {
            files.push(file_entry(&tail(8), parts.get(1).copied().unwrap_or("..")));
        } else if line.starts_with("2 ") {
            let tail = tail(9);
            let path = tail.split('\t').next().unwrap_or("");
            files.push(file_entry(path, parts.get(1).copied().unwrap_or("..")));
        } else if line.starts_with("u ") {
            files.push(json!({"path":tail(10),"status":"conflicted","staged":true,
                "unstaged":true,"indexStatus":"conflicted","workTreeStatus":"conflicted"}));
        }
    }
    files
}

fn parse_branch(status: &str) -> (Option<String>, u64, u64) {
    let (mut branch, mut ahead, mut behind) = (None, 0, 0);
    for line in status.split('\n') {
        if let Some(value) = line.strip_prefix("# branch.head ") {
            branch = if value == "(detached)" {
                None
            } else {
                Some(value.to_owned())
            };
        } else if let Some(value) = line.strip_prefix("# branch.ab ") {
            let parts: Vec<_> = value.split_whitespace().collect();
            if parts.len() == 2 {
                if let (Some(a), Some(b)) = (parts[0].strip_prefix('+'), parts[1].strip_prefix('-'))
                {
                    if let (Ok(a), Ok(b)) = (a.parse::<u64>(), b.parse::<u64>()) {
                        (ahead, behind) = (a, b);
                    }
                }
            }
        }
    }
    (branch, ahead, behind)
}

fn parse_log(log: &str) -> Vec<Value> {
    log.split('\n')
        .filter_map(|line| {
            let line = line.strip_suffix('\r').unwrap_or(line);
            if line.is_empty() {
                return None;
            }
            let parts: Vec<_> = line.split('\t').collect();
            Some(if parts.len() < 3 {
                json!({"hash":parts[0],"committedAt":null,"title":parts[1..].join(" ")})
            } else {
                json!({"hash":parts[0],"committedAt":parts[1],"title":parts[2..].join("\t")})
            })
        })
        .collect()
}

fn parse_sizes(sizes: &str) -> Map<String, Value> {
    let mut result = Map::new();
    for entry in sizes.split('\0') {
        let Some((meta, path)) = entry.split_once('\t') else {
            continue;
        };
        let Some(value) = meta.split_whitespace().nth(3) else {
            continue;
        };
        let Ok(size) = value.parse::<f64>() else {
            continue;
        };
        if let Some(number) = serde_json::Number::from_f64(size) {
            result.insert(path.to_owned(), Value::Number(number));
        }
    }
    result
}

pub fn process_snapshot(request: &Value) -> Result<Value, &'static str> {
    if !request.is_object() || request.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("expected snapshot request version 1");
    }
    let field = |name| -> Result<&str, &'static str> {
        match request.get(name) {
            None => Ok(""),
            Some(Value::String(s)) => Ok(s),
            _ => Err("snapshot fields must be strings"),
        }
    };
    let status = field("status")?;
    let files = parse_files(status);
    let (branch, ahead, behind) = parse_branch(status);
    let tree: Vec<_> = field("tree")?
        .split('\0')
        .filter(|s| !s.is_empty())
        .collect();
    Ok(json!({
        "version":1, "branch":branch, "ahead":ahead, "behind":behind,
        "isDirty":!files.is_empty(), "files":files, "recentCommits":parse_log(field("log")?),
        "repoTree":tree, "fileSizes":parse_sizes(field("sizes")?),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_snapshot() {
        let out = process_snapshot(&json!({"version":1})).unwrap();
        assert_eq!(out["branch"], Value::Null);
        assert_eq!(out["files"], json!([]));
        assert_eq!(out["repoTree"], json!([]));
        assert_eq!(out["fileSizes"], json!({}));
        assert_eq!(out["isDirty"], false);
    }

    #[test]
    fn unknown_protocol_and_wrong_types_fail() {
        for value in [
            json!(null),
            json!([]),
            json!({"version":2}),
            json!({"version":1,"tree":3}),
            json!({"version":1,"log":null}),
        ] {
            assert!(process_snapshot(&value).is_err());
        }
    }

    #[test]
    fn tracked_unicode_spaces_rename_and_conflict() {
        let out = process_snapshot(&json!({"version":1,"status":concat!(
            "1 MM N... 100644 100644 100644 h1 h2 src/café file.js\n",
            "2 R. N... 100644 100644 100644 h1 h2 R100 new name.js\told.js\n",
            "u UU N... 100644 100644 100644 100644 h1 h2 h3 conflict.js\n",
            "? untracked.js\n")}))
        .unwrap();
        assert_eq!(out["files"][0]["path"], "src/café file.js");
        assert_eq!(out["files"][0]["staged"], true);
        assert_eq!(out["files"][0]["unstaged"], true);
        assert_eq!(out["files"][1]["path"], "new name.js");
        assert_eq!(out["files"][1]["status"], "renamed");
        assert_eq!(out["files"][2]["status"], "conflicted");
        assert_eq!(out["files"][3]["status"], "untracked");
    }

    #[test]
    fn unknown_index_status_preserves_known_worktree_precedence() {
        assert_eq!(file_entry("file", "ZC")["status"], "renamed");
        assert_eq!(file_entry("file", "Z.")["status"], "unmodified");
        assert_eq!(file_entry("file", "ZZ")["status"], "modified");
    }

    #[test]
    fn branch_and_detached_head() {
        let out = process_snapshot(
            &json!({"version":1,"status":"# branch.head feature/test\n# branch.ab +12 -3\n"}),
        )
        .unwrap();
        assert_eq!(out["branch"], "feature/test");
        assert_eq!(out["ahead"], 12);
        assert_eq!(out["behind"], 3);
        let out = process_snapshot(
            &json!({"version":1,"status":"# branch.head (detached)\n# branch.ab garbage"}),
        )
        .unwrap();
        assert_eq!(out["branch"], Value::Null);
        assert_eq!(out["ahead"], 0);
    }

    #[test]
    fn commit_subject_tabs_crlf_and_legacy_lines() {
        let out = parse_log("abc\t2026-11-06T00:00:00Z\tfix\tthing\r\nold\told title\n");
        assert_eq!(out[0]["title"], "fix\tthing");
        assert_eq!(
            out[1],
            json!({"hash":"old","committedAt":null,"title":"old title"})
        );
    }

    #[test]
    fn tree_keeps_nuls_and_path_characters() {
        let out = process_snapshot(&json!({"version":1,"tree":"a b\0café\0line\nfile\0"})).unwrap();
        assert_eq!(out["repoTree"], json!(["a b", "café", "line\nfile"]));
    }

    #[test]
    fn sizes_skip_malformed_and_nonfinite_entries() {
        let sizes = parse_sizes(
            &[
                "100644 blob h 10\tgood.js",
                "160000 commit h -\tsub",
                "bad",
                "100644 blob h NaN\tinvalid",
            ]
            .join("\0"),
        );
        assert_eq!(sizes, json!({"good.js":10.0}).as_object().unwrap().clone());
    }

    #[test]
    fn reserved_property_names_are_data() {
        let out =
            process_snapshot(&json!({"version":1,"sizes":"100644 blob h 5\t__proto__\0"})).unwrap();
        assert_eq!(out["fileSizes"]["__proto__"], 5.0);
    }
}
