import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';
export function FileInspector({ path, workspace, api, change, revision, onClose, onQuest }) {
  const [tab, setTab] = useState('story');
  const [file, setFile] = useState(null);
  const [diff, setDiff] = useState(null);
  useEffect(() => {
    let alive = true;
    api.workspace.readFile(workspace.id, path).then(result => { if (alive) setFile(result); }, err => { if (alive) setFile({ error: { message: err.message } }); });
    api.git.getFileDiff(workspace.id, path).then(result => { if (alive) setDiff(result); }, err => { if (alive) setDiff({ error: { message: err.message } }); });
    return () => { alive = false; };
  }, [api, workspace.id, path, change, revision]);
  return <aside className="drawer inspector" aria-label="Building inspector">
    <div className="drawer-heading"><span className="eyebrow">BUILDING DISCOVERED</span><button className="icon-button" onClick={onClose} aria-label="Close inspector"><Icon name="close"/></button></div>
    <div className="building-emblem"><Icon name="file" size={32}/><i/></div>
    <h2>{path.split('/').at(-1)}</h2><p className="file-path">{path}</p>
    <div className="file-facts"><span className={change ? 'amber' : 'mint'}><i className="status-dot"/>{change ? change.staged ? 'Staged changes' : 'Uncommitted changes' : 'In harmony'}</span><span>{file?.size != null ? `${(file.size / 1024).toFixed(1)} KB` : 'Reading…'}</span></div>
    <div className="drawer-tabs"><button className={tab === 'story' ? 'active' : ''} onClick={() => setTab('story')}>Inside the building</button><button className={tab === 'changes' ? 'active' : ''} onClick={() => setTab('changes')}>Changes {change ? '•' : ''}</button></div>
    <div className="file-source" tabIndex={0} aria-label={tab === 'story' ? 'File contents' : 'File changes'}>
      {tab === 'story' ? !file ? <p>Opening the door…</p> : file.error ? <p role="alert">{file.error.message}</p> : file.binary ? <p>This building holds a binary file. Text preview is unavailable.</p> : <><pre>{file.content || '(empty file)'}</pre>{file.truncated && <p className="preview-note">Preview limited to the first 128 KiB.</p>}</> : !diff ? <p>Reading changes…</p> : diff.error ? <p role="alert">{diff.error.message}</p> : <><pre>{diff.text ? diff.text.split('\n').map((line, i) => <span key={i} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : ''}>{line}{'\n'}</span>) : 'No changes against HEAD.'}</pre>{diff.truncated && <p className="preview-note">Diff preview truncated.</p>}</>}
    </div>
    <button className="primary-button inspector-quest" onClick={() => onQuest(`Explore ${path} and explain what it does and how it connects to the rest of the project. Do not edit any files.`)}><Icon name="spark"/>Send an adventurer here<Icon name="arrow"/></button>
  </aside>;
}
