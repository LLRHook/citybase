// Channel names shared between the main process (ipcHandlers.cjs) and
// the preload bridge (preload.cjs). Single source of truth so a typo
// can't silently break the streamed-events fan-out.

const AGENT_EVENT_CHANNEL = 'citybase:agent.event';

// One-shot payload pushed by main.cjs once webContents.did-finish-load
// fires; the renderer subscribes via citybaseApi.app.onBoot. Carries the
// initial agent-detection result and the auto-restored workspace so the
// renderer doesn't need to make two extra IPC roundtrips on mount.
const BOOT_PAYLOAD_CHANNEL = 'citybase:boot.payload';

module.exports = { AGENT_EVENT_CHANNEL, BOOT_PAYLOAD_CHANNEL };
