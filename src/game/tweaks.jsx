// tweaks.jsx — floating tweaks panel for runtime toggles.
// Adapted from the prototype's iframe-host tweaks-panel — runs standalone here
// (no postMessage protocol, just local state).
import React from 'react';

const TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    background:rgba(12,17,36,.92);color:#e8ecff;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:1px solid rgba(93,212,255,.3);border-radius:8px;
    box-shadow:0 0 0 1px rgba(7,9,20,1) inset,0 12px 40px rgba(0,0,0,.5),0 0 24px rgba(93,212,255,.15);
    font:11.5px/1.4 'JetBrains Mono', ui-monospace, monospace;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none;
    border-bottom:1px solid rgba(93,212,255,.15);background:rgba(93,212,255,.05)}
  .twk-hd b{font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#5dd4ff}
  .twk-x{appearance:none;border:0;background:transparent;color:#5a6296;
    width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(255,255,255,.06);color:#e8ecff}
  .twk-body{padding:12px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:#9aa3d4}
  .twk-lbl>span:first-child{font-weight:500;font-size:10px;letter-spacing:0.5px}
  .twk-sect{font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;
    color:#5a6296;padding:6px 0 0;border-top:1px dashed rgba(255,255,255,.08)}
  .twk-sect:first-child{padding-top:0;border-top:0}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:4px;
    background:rgba(0,0,0,.4);border:1px solid rgba(93,212,255,.2);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:3px;
    background:rgba(93,212,255,.2);border:1px solid rgba(93,212,255,.5);
    box-shadow:0 0 8px rgba(93,212,255,.3);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:#9aa3d4;font:inherit;font-weight:500;min-height:22px;
    border-radius:3px;cursor:pointer;padding:4px 6px;line-height:1.2;
    text-transform:uppercase;letter-spacing:0.5px;font-size:9px;
    transition:color .15s}
  .twk-seg button[aria-checked="true"]{color:#5dd4ff;font-weight:700}

  .twk-toggle{position:relative;width:32px;height:18px;border:1px solid rgba(255,255,255,.15);
    border-radius:999px;background:rgba(0,0,0,.4);transition:all .15s;cursor:pointer;padding:0;
    box-sizing:border-box}
  .twk-toggle[data-on="1"]{background:rgba(95,227,154,.3);border-color:#5fe39a;
    box-shadow:0 0 6px rgba(95,227,154,.4)}
  .twk-toggle i{position:absolute;top:1px;left:1px;width:14px;height:14px;border-radius:50%;
    background:#9aa3d4;box-shadow:0 1px 2px rgba(0,0,0,.5);transition:all .15s;display:block}
  .twk-toggle[data-on="1"] i{transform:translateX(14px);background:#5fe39a;
    box-shadow:0 0 6px rgba(95,227,154,.6)}

  .twk-fab{position:fixed;right:16px;bottom:16px;z-index:2147483645;
    width:40px;height:40px;border-radius:50%;
    background:rgba(12,17,36,.92);border:1px solid rgba(93,212,255,.5);
    color:#5dd4ff;cursor:pointer;font-size:18px;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 0 12px rgba(93,212,255,.3)}
  .twk-fab:hover{background:rgba(93,212,255,.1)}
`;

export function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues(prev => ({ ...prev, ...edits }));
  }, []);
  return [values, setTweak];
}

export function TweaksPanel({ title = 'Tweaks', children }) {
  const [open, setOpen] = React.useState(true);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);

  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, [open, clampToViewport]);

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <React.Fragment>
      <style>{TWEAKS_STYLE}</style>
      {!open && (
        <button className="twk-fab" onClick={() => setOpen(true)} aria-label="Open tweaks">⚙</button>
      )}
      {open && (
        <div ref={dragRef} className="twk-panel"
          style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
          <div className="twk-hd" onMouseDown={onDragStart}>
            <b>{title}</b>
            <button
              className="twk-x" aria-label="Close tweaks"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setOpen(false)}
            >✕</button>
          </div>
          <div className="twk-body">{children}</div>
        </div>
      )}
    </React.Fragment>
  );
}

export function TweakSection({ title, children }) {
  return (
    <React.Fragment>
      <div className="twk-sect">{title}</div>
      {children}
    </React.Fragment>
  );
}

function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span>{value}</span>}
      </div>
      {children}
    </div>
  );
}

export function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button
        type="button" className="twk-toggle" data-on={value ? '1' : '0'}
        role="switch" aria-checked={!!value}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  );
}

export function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const opts = options.map(o => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" className="twk-seg">
        <div
          className="twk-seg-thumb"
          style={{
            left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
            width: `calc((100% - 4px) / ${n})`,
          }}
        />
        {opts.map(o => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}
