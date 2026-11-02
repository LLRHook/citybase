import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const files = [...new Set(execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '--', '*.md'], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean))];
let checked = 0;
const failures = [];
for (const file of files) {
  if (file.startsWith('docs/history/') || file.startsWith('.cycle/')) continue;
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (text.includes('<!-- historical-baseline -->')) continue;
  const prose = text.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '');
  for (const match of prose.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) continue;
    checked++;
    let decoded;
    try { decoded = decodeURIComponent(target); } catch { failures.push(`${file}: invalid link ${target}`); continue; }
    const resolved = decoded.startsWith('/') ? path.join(root, decoded.slice(1)) : path.resolve(path.dirname(file), decoded);
    if (!existsSync(resolved)) failures.push(`${file}: missing ${target}`);
  }
}
for (const failure of failures) console.error(failure);
console.log(`Documentation links: ${checked} local targets checked, ${failures.length} missing or invalid.`);
if (failures.length) process.exitCode = 1;
