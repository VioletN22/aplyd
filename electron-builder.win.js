// Windows build config. Runs on a real Windows machine via GitHub Actions
// (.github/workflows/build-windows.yml) because the native DB module (better-sqlite3)
// has no prebuilt binary for this app's Electron version and must be compiled on
// Windows. Produces an installer and a portable .exe.
module.exports = {
  appId: 'com.purpl.aplyd',
  productName: 'aplyd',
  directories: { buildResources: 'assets', output: 'release' },
  files: [
    'dist/main/**/*',
    'dist/renderer/**/*',
    'dist/shared/**/*',
    'node_modules/**/*',
    'package.json',
    'assets/**/*',
  ],
  asarUnpack: ['node_modules/better-sqlite3/**/*'],
  win: {
    icon: 'assets/icon.png',
    target: [
      { target: 'nsis', arch: ['x64'] },      // normal installer
      { target: 'portable', arch: ['x64'] },  // single double-click .exe, no install
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: 'aplyd-setup-${version}.exe',
  },
  portable: { artifactName: 'aplyd-portable-${version}.exe' },
  extraResources: [{ from: 'assets', to: 'assets' }],
};
