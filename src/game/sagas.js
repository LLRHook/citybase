// src/game/sagas.js — re-export shim. Canonical source is src/data/seed.js.
// Kept so existing imports (`./game/sagas.js`, `../game/sagas.js`) keep working.
// New mock data should be added to src/data/seed.js, not here.

export { SAGAS, QUESTS_V2, ADV_REPORTS } from '../data/seed.js';
