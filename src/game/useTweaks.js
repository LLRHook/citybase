import { useState, useCallback } from 'react';

/**
 * Manage a map of tweakable values and provide a setter that merges updates into that map.
 *
 * @param {Object} defaults - Initial values object used to seed the hook state.
 * @returns {[Object, Function]} An array where:
 *   - `values` is the current values object.
 *   - `setTweak` is a function that accepts either an object of key/value edits or a single `key` and `value`, and merges those edits into `values`.
 */
export function useTweaks(defaults) {
  const [values, setValues] = useState(defaults);
  const setTweak = useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues(prev => ({ ...prev, ...edits }));
  }, []);
  return [values, setTweak];
}
