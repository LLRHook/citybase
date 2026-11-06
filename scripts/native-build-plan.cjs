const path = require('node:path');

function nativeBuildPlan(root, platform, arch) {
  const targets = {
    'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin',
    'linux-arm64': 'aarch64-unknown-linux-gnu', 'linux-x64': 'x86_64-unknown-linux-gnu',
    'win32-arm64': 'aarch64-pc-windows-msvc', 'win32-x64': 'x86_64-pc-windows-msvc',
  };
  const key = `${platform}-${arch}`;
  const target = targets[key];
  if (!target) throw new Error(`Unsupported native snapshot target: ${key}`);
  const binary = platform === 'win32' ? 'citybase-snapshot.exe' : 'citybase-snapshot';
  return { target, binary, destination: path.join(root, 'native', 'bin', key, binary) };
}

module.exports = { nativeBuildPlan };
