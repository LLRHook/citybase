const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { nativeBuildPlan } = require('./native-build-plan.cjs');

function buildForPack(context, spawn = spawnSync) {
  // electron-builder's Arch enum: ia32=0, x64=1, armv7l=2, arm64=3, universal=4.
  const arch = { 1: 'x64', 3: 'arm64' }[context.arch];
  const root = context.packager.projectDir;
  nativeBuildPlan(root, context.electronPlatformName, arch); // fail before packing a wrong-architecture helper
  const result = spawn(process.execPath, [path.join(root, 'scripts', 'build-native.mjs'),
    `--platform=${context.electronPlatformName}`, `--arch=${arch}`], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || 'Native snapshot build failed before packaging');
}

module.exports = (context) => buildForPack(context);
module.exports.buildForPack = buildForPack;
