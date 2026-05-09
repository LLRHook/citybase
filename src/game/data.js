// src/game/data.js — re-export shim for the small handful of constants
// and pure helpers the renderer still pulls out of src/data/seed.js.
//
// The mock entities (REPO, DISTRICTS, BUILDINGS, GUILDS, ACTIVITY,
// SAGAS, QUESTS_V2, ADV_REPORTS) used to be re-exported here too, but
// the renderer no longer reads them in production paths — the city is
// projected from a real Git tree, the Run History panel reads real
// agentManager state, and the modals receive districts as a prop.
// They remain in seed.js purely as test fixtures.
//
// What's left here is:
//   - SKILL_DEFS: a constant icon/colour map per skill kind (an enum,
//     not user data).
//   - hpFromContext / fmtTokens: pure formatters for the HP bar.
export {
  SKILL_DEFS,
  hpFromContext,
  fmtTokens,
} from '../data/seed.js';
