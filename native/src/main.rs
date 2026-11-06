#![forbid(unsafe_code)]

use citybase_snapshot::{process_snapshot, MAX_INPUT_BYTES};
use std::io::{self, Read, Write};

fn run() -> Result<(), String> {
    if std::env::args_os().len() != 1 {
        return Err("this processor accepts a JSON request on stdin only".into());
    }
    let mut input = Vec::new();
    io::stdin()
        .take(MAX_INPUT_BYTES + 1)
        .read_to_end(&mut input)
        .map_err(|_| "could not read snapshot request")?;
    if input.len() as u64 > MAX_INPUT_BYTES {
        return Err("snapshot request exceeds 128 MiB".into());
    }
    let request = serde_json::from_slice(&input).map_err(|_| "invalid snapshot JSON")?;
    let result = process_snapshot(&request)?;
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &result).map_err(|_| "could not write snapshot response")?;
    stdout
        .write_all(b"\n")
        .map_err(|_| "could not write snapshot response")?;
    Ok(())
}

fn main() {
    if let Err(message) = run() {
        eprintln!("citybase-snapshot: {message}");
        std::process::exit(2);
    }
}
