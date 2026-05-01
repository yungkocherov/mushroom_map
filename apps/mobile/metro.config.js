const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// npm workspaces: символлинки в node_modules лежат на root + здесь.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// Package exports field support — без этого `@mushroom-map/tokens/native`
// не резолвится потому что src/native.ts маппится через
// "./native": "./src/native.ts" в exports field.
config.resolver.unstable_enablePackageExports = true;

config.resolver.assetExts = [
  ...config.resolver.assetExts,
  'pmtiles',
];

module.exports = config;
