// One core may write a profile's workspace/run history at a time. Each
// claimant gets a unique filename so reclaiming a dead process cannot unlink
// a newer owner's lock. PID-in-name publication needs no JSON write/read race.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const CLAIM_PATTERN = /^owner-([1-9][0-9]*)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.lock$/;

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Permission errors do not establish that an owner has died.
    return error.code !== 'ESRCH';
  }
}

async function acquireUserDataLock(userDataDir) {
  const directory = path.join(userDataDir, '.citybase-core-locks');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `owner-${process.pid}-${crypto.randomUUID()}.lock`;
  const claim = path.join(directory, name);
  let ownsClaim = false;
  const release = async () => {
    if (!ownsClaim) return;
    await fs.rm(claim, { force: true });
    ownsClaim = false;
  };

  try {
    const file = await fs.open(claim, 'wx', 0o600);
    ownsClaim = true;
    await file.close();
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === name || !entry.isFile()) continue;
      const match = CLAIM_PATTERN.exec(entry.name);
      if (!match) continue;
      if (isAlive(Number(match[1]))) {
        const error = new Error(`Another Citybase core is using this state directory: ${userDataDir}. Close that instance or set CITYBASE_CORE_USERDATA to a separate directory.`);
        error.code = 'CORE_PROFILE_IN_USE';
        throw error;
      }
      await fs.rm(path.join(directory, entry.name), { force: true });
    }
    return release;
  } catch (error) {
    await release();
    throw error;
  }
}

module.exports = { acquireUserDataLock };
