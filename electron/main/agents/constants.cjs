// Channel names shared between the main process (ipcHandlers.cjs) and
// the preload bridge (preload.cjs). Single source of truth so a typo
// can't silently break the streamed-events fan-out.

const AGENT_EVENT_CHANNEL = 'citybase:agent.event';

module.exports = { AGENT_EVENT_CHANNEL };
