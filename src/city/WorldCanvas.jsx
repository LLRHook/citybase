import { useEffect, useRef, useState } from 'react';
import { createCityScene } from './createCityScene.js';
import { reconcileWorldView } from './worldView.js';

export function WorldCanvas({ model, sceneRef, selected, changes, activePaths, activeRun, district, time, orbit, scout, visited, onSelect, onVisit, onReady }) {
  const host = useRef(null);
  const savedView = useRef(null);
  const callbacks = useRef({ onSelect, onVisit, onReady, selected, district });
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);
  useEffect(() => { callbacks.current = { onSelect, onVisit, onReady, selected, district }; }, [onSelect, onVisit, onReady, selected, district]);
  useEffect(() => {
    let scene;
    let alive = true;
    try {
      scene = createCityScene(host.current, {
        model,
        onSelect: path => callbacks.current.onSelect?.(path),
        onHover: (path, point) => setHover(path ? { path, ...point } : null),
        onVisitDistrict: id => callbacks.current.onVisit?.(id),
        onReady: stats => callbacks.current.onReady?.(stats),
        onError: err => { setError(err.message); callbacks.current.onReady?.({ error: err.message }); },
      });
      sceneRef.current = scene;
      if (savedView.current) scene.restoreView?.(reconcileWorldView(savedView.current.view, savedView.current.model, model, callbacks.current));
    } catch (err) { queueMicrotask(() => { if (alive) { setError(err.message); callbacks.current.onReady?.({ error: err.message }); } }); }
    return () => { alive = false; savedView.current = { view: scene?.captureView?.(), model }; scene?.destroy(); sceneRef.current = null; };
  }, [model, sceneRef]);
  useEffect(() => { sceneRef.current?.setSelection(selected); }, [selected, model, sceneRef]);
  useEffect(() => { sceneRef.current?.setStatus?.(changes); }, [changes, model, sceneRef]);
  useEffect(() => { sceneRef.current?.setActivity(activePaths, activeRun?.status === 'running'); }, [activePaths, activeRun, model, sceneRef]);
  useEffect(() => { sceneRef.current?.setDistrict(district); }, [district, model, sceneRef]);
  useEffect(() => { sceneRef.current?.setTime(time); }, [time, model, sceneRef]);
  useEffect(() => { sceneRef.current?.setOrbit(orbit); }, [orbit, model, sceneRef]);
  useEffect(() => { sceneRef.current?.setScout?.(scout); }, [scout, model, sceneRef]);
  useEffect(() => { sceneRef.current?.setVisited?.(visited); }, [visited, model, sceneRef]);
  return <>
    <div ref={host} className="world-canvas" data-testid="world-canvas" aria-label="Interactive repository city. Drag to orbit, scroll to zoom. Use Atlas to navigate with a keyboard." />
    {error && <div className="graphics-fallback" role="status"><strong>The atlas is still open.</strong><p>Your graphics device couldn’t draw the 3D city. Explore every file through the Atlas.</p><small>{error}</small></div>}
    {hover && <div className="building-tooltip" style={{ left: Math.min(hover.x + 16, globalThis.innerWidth - 310), top: hover.y - 65 }}><span>INVESTIGATE BUILDING</span><strong>{hover.path.split('/').at(-1)}</strong><small>{hover.path}</small></div>}
  </>;
}
