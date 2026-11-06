// parseLsTreeSizes — blob sizes for the 3D city's building heights (FEAT-024).
import { describe, expect, it } from 'vitest';
import { processSnapshot } from '../../electron/main/services/snapshotProcessor.cjs';
const parseLsTreeSizes = async (value) => (await processSnapshot({ sizes: value })).fileSizes;

const entry = (size, path, { mode = '100644', type = 'blob' } = {}) =>
  `${mode} ${type} abc123def456 ${String(size).padStart(7, ' ')}\t${path}`;

describe('parseLsTreeSizes', () => {
  it('maps path → byte size from -z entries', async () => {
    const stdout = [entry(1234, 'src/App.jsx'), entry(88, 'README.md')].join('\0') + '\0';
    expect(await parseLsTreeSizes(stdout)).toEqual({ 'src/App.jsx': 1234, 'README.md': 88 });
  });

  it('skips non-blob entries (size "-") and malformed lines', async () => {
    const stdout = [
      entry('-', 'sub', { mode: '160000', type: 'commit' }),
      'garbage without a tab',
      entry(10, 'ok.js'),
    ].join('\0');
    expect(await parseLsTreeSizes(stdout)).toEqual({ 'ok.js': 10 });
  });

  it('keeps unicode paths raw (quotePath=false pipeline)', async () => {
    expect(await parseLsTreeSizes(entry(5, 'src/café.js'))).toEqual({ 'src/café.js': 5 });
  });

  it('returns an empty map for empty/absent output', async () => {
    expect(await parseLsTreeSizes('')).toEqual({});
    expect(await parseLsTreeSizes(undefined)).toEqual({});
  });
});
