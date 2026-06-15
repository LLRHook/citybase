// processService.buildInvocation tests.
//
// The interesting behavior here is the Windows .cmd / .bat shim wrap.
// Node's execFile cannot directly spawn .cmd / .bat files — it returns
// `spawn EINVAL`. We have to invoke them through `cmd.exe /d /s /c
// "<cmd> <args>"` with windowsVerbatimArguments so cmd.exe's own
// quoting rules apply (and shell metacharacters in the prompt get
// caret-escaped). The `run` function itself is exercised end-to-end
// by the agent adapter tests; here we lock down the pure invocation
// builder in isolation.
import process from 'node:process';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { buildInvocation, spawnStream } from '../../electron/main/services/processService.cjs';

// Exercise the streaming runner against the real node binary (cross-platform,
// always present in the test env). node.exe is not a .cmd, so no shim wrap.
const NODE = process.execPath;
const cwd = tmpdir();

describe('processService.spawnStream', () => {
  it('streams stdout chunks and resolves ok with the full output', async () => {
    const chunks = [];
    const h = spawnStream(NODE, ['-e', "process.stdout.write('alpha\\n');process.stdout.write('beta\\n')"], {
      cwd, onStdout: (c) => chunks.push(c),
    });
    expect(typeof h.pid === 'number' || h.pid === undefined).toBe(true);
    const r = await h.done;
    expect(r.ok).toBe(true);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('alpha');
    expect(r.stdout).toContain('beta');
    expect(chunks.join('')).toContain('beta'); // arrived via the live callback
    expect(r.killed).toBe(false);
    expect(r.timedOut).toBe(false);
  });

  it('reports a non-zero exit as not-ok with the code and stderr', async () => {
    const r = await spawnStream(NODE, ['-e', "process.stderr.write('boom');process.exit(3)"], { cwd }).done;
    expect(r.ok).toBe(false);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('boom');
  });

  it('kill() terminates a long-running child within seconds', async () => {
    const h = spawnStream(NODE, ['-e', 'setInterval(() => {}, 1000)'], { cwd });
    h.kill();
    const r = await h.done;
    expect(r.killed).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('enforces a timeout by killing the child', async () => {
    const r = await spawnStream(NODE, ['-e', 'setInterval(() => {}, 1000)'], { cwd, timeoutMs: 300 }).done;
    expect(r.timedOut).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('pipes stdin when provided', async () => {
    const r = await spawnStream(NODE, ['-e', "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write('GOT:'+d))"], {
      cwd, stdin: 'hello',
    }).done;
    expect(r.stdout).toContain('GOT:hello');
  });

  it('validates command, args, and cwd', () => {
    expect(() => spawnStream('', [], { cwd })).toThrow(/command/);
    expect(() => spawnStream(NODE, 'nope', { cwd })).toThrow(/args/);
    expect(() => spawnStream(NODE, [], {})).toThrow(/cwd/);
  });
});

describe('processService.buildInvocation — passthrough', () => {
  it('returns command + args unchanged on POSIX', () => {
    expect(buildInvocation('claude', ['--print', 'hi'], {}, 'linux'))
      .toEqual({ command: 'claude', args: ['--print', 'hi'] });
  });

  it('returns command + args unchanged for a .exe binary on Windows', () => {
    expect(buildInvocation(String.raw`C:\Users\v\.local\bin\claude.exe`, ['--print', 'hi'], {}, 'win32'))
      .toEqual({
        command: String.raw`C:\Users\v\.local\bin\claude.exe`,
        args: ['--print', 'hi'],
      });
  });
});

describe('processService.buildInvocation — Windows .cmd / .bat wrap', () => {
  it('wraps a .cmd shim through cmd.exe /d /s /c with windowsVerbatimArguments', () => {
    const out = buildInvocation(
      String.raw`C:\Users\v\AppData\Roaming\npm\codex.cmd`,
      ['exec', '--cd', String.raw`C:\repo`, '-'],
      { ComSpec: String.raw`C:\Windows\System32\cmd.exe` },
      'win32',
    );
    expect(out.command).toBe(String.raw`C:\Windows\System32\cmd.exe`);
    expect(out.args[0]).toBe('/d');
    expect(out.args[1]).toBe('/s');
    expect(out.args[2]).toBe('/c');
    // The fourth arg is one big quoted command line for cmd.exe.
    const inner = out.args[3];
    expect(inner.startsWith('"')).toBe(true);
    expect(inner.endsWith('"')).toBe(true);
    expect(inner).toContain(`codex.cmd`);
    expect(inner).toContain('exec');
    expect(out.windowsVerbatimArguments).toBe(true);
  });

  it('wraps a .bat shim the same way', () => {
    const out = buildInvocation(
      String.raw`C:\tools\thing.bat`,
      ['arg1'],
      { ComSpec: String.raw`C:\Windows\System32\cmd.exe` },
      'win32',
    );
    expect(out.command).toBe(String.raw`C:\Windows\System32\cmd.exe`);
    expect(out.windowsVerbatimArguments).toBe(true);
  });

  it('falls back to cmd.exe when the env has no ComSpec', () => {
    const out = buildInvocation(
      String.raw`C:\tools\thing.cmd`,
      [],
      {},
      'win32',
    );
    // process.env.ComSpec or the literal 'cmd.exe' fallback.
    expect(out.command.toLowerCase()).toMatch(/cmd\.exe$/);
  });

  it('caret-escapes cmd metacharacters inside args so a prompt cannot inject', () => {
    const out = buildInvocation(
      String.raw`C:\tools\thing.cmd`,
      ['fix bug & rm -rf', 'with | pipe', 'and "quotes"'],
      { ComSpec: 'cmd.exe' },
      'win32',
    );
    const inner = out.args[3];
    // The dangerous metacharacters are caret-prefixed.
    expect(inner).toContain('^&');
    expect(inner).toContain('^|');
    expect(inner).toContain('^"');
  });

  it('quotes empty-string args as "" so positional shapes survive', () => {
    const out = buildInvocation(
      String.raw`C:\tools\thing.cmd`,
      ['', 'x'],
      { ComSpec: 'cmd.exe' },
      'win32',
    );
    expect(out.args[3]).toContain('"" ');
  });
});
