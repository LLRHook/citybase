import { createRef } from 'react';
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { WorldCanvas } from '../city/WorldCanvas.jsx';
import { createCityScene } from '../city/createCityScene.js';
import { createWorldModel } from '../city/worldModel.js';
import { reconcileWorldView } from '../city/worldView.js';

vi.mock('../city/createCityScene.js', () => ({ createCityScene: vi.fn() }));

it('rebuilds only for topology changes, using the latest focus and disposing each old scene', () => {
  const view = { position: [10, 20, 30], target: [1, 0, 2], scoutPosition: [3, 0, 4], zoom: 2 };
  const scenes = [];
  createCityScene.mockImplementation(() => {
    const scene = {
      captureView: vi.fn(() => view), restoreView: vi.fn(), destroy: vi.fn(),
      setSelection: vi.fn(), setActivity: vi.fn(), setDistrict: vi.fn(), setTime: vi.fn(), setOrbit: vi.fn(),
    };
    scenes.push(scene);
    return scene;
  });
  const sceneRef = createRef();
  const before = createWorldModel(['src/m.js', 'src/z.js']);
  const after = createWorldModel(['src/a.js', 'src/m.js', 'src/z.js']);
  const { rerender, unmount } = render(<WorldCanvas model={before} sceneRef={sceneRef} selected="src/m.js" />);
  rerender(<WorldCanvas model={before} sceneRef={sceneRef} selected="src/z.js" />);
  expect(scenes).toHaveLength(1);
  rerender(<WorldCanvas model={after} sceneRef={sceneRef} selected="src/z.js" />);
  expect(scenes).toHaveLength(2);
  expect(scenes[0].destroy).toHaveBeenCalledOnce();
  expect(scenes[1].restoreView).toHaveBeenCalledWith(reconcileWorldView(view, before, after, { selected: 'src/z.js' }));
  expect(sceneRef.current).toBe(scenes[1]);
  unmount();
  expect(scenes[1].destroy).toHaveBeenCalledOnce();
  expect(sceneRef.current).toBeNull();
});
