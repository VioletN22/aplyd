module.exports = {
  appId: 'com.purpl.aplyd',
  productName: 'aplyd',
  directories: {
    buildResources: 'assets',
    output: 'release',
  },
  files: [
    'dist/main/**/*',
    'dist/renderer/**/*',
    'dist/shared/**/*',
    'node_modules/**/*',
    'package.json',
    'assets/**/*',
  ],
  asarUnpack: [
    'node_modules/better-sqlite3/**/*',
  ],
  mac: {
    icon: 'assets/icon.icns',
    category: 'public.app-category.productivity',
    target: [
      { target: 'dir', arch: ['arm64'] },
    ],
  },
  extraResources: [
    { from: 'assets', to: 'assets' },
  ],
};
