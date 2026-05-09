import { describe, expect, it } from 'vitest';
import { buildInvocation, run } from '../../electron/main/services/processService.cjs';

describe('processService buildInvocation', () => {
  it('runs Windows .cmd shims through cmd.exe with argv preserved', () => {
    const out = buildInvocation(
      'C:\\Users\\Victor\\.local\\bin\\codex.cmd',
      ['exec', '--version'],
      { ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
      'win32',
    );

    expect(out).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        '""C:\\Users\\Victor\\.local\\bin\\codex.cmd" "exec" "--version""',
      ],
      windowsVerbatimArguments: true,
    });
  });

  it('quotes Windows shim args with spaces for cmd.exe', () => {
    const out = buildInvocation(
      'C:\\Users\\Victor\\AppData\\Roaming\\npm\\codex.cmd',
      ['exec', '--cd', 'C:\\Users\\Victor\\Documents\\personal projects\\citybase', '-'],
      { ComSpec: 'cmd.exe' },
      'win32',
    );

    expect(out.args.at(-1)).toContain('"C:\\Users\\Victor\\Documents\\personal projects\\citybase"');
  });

  it('leaves native executables alone', () => {
    expect(buildInvocation('/usr/local/bin/codex', ['--version'], {}, 'linux'))
      .toEqual({ command: '/usr/local/bin/codex', args: ['--version'] });
    expect(buildInvocation('C:\\bin\\codex.exe', ['--version'], {}, 'win32'))
      .toEqual({ command: 'C:\\bin\\codex.exe', args: ['--version'] });
  });

  it('pipes stdin to child processes', async () => {
    const out = await run(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
      cwd: process.cwd(),
      stdin: 'hello from stdin',
    });

    expect(out.ok).toBe(true);
    expect(out.stdout).toBe('hello from stdin');
  });
});
