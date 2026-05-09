// src/game/data.js — re-export shim. Canonical source is src/data/seed.js.
// Kept so existing imports (`./game/data.js`, `../game/data.js`) keep working.
// New mock data should be added to src/data/seed.js, not here.

export {
  REPO,
  DISTRICTS,
  BUILDINGS,
  GUILDS,
  SKILL_DEFS,
  ACTIVITY,
  hpFromContext,
  fmtTokens,
} from '../data/seed.js';
