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

// data/ и logs/ в workspace root содержат multi-GB файлы (geojson, sqlite,
// pmtiles исходники) — metro-file-map worker падает с ERR_FS_FILE_TOO_LARGE
// на файлах >2 GiB. Эти каталоги мобильному билду не нужны.
const escaped = (p) => p.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
config.resolver.blockList = [
  new RegExp(`^${escaped(path.join(workspaceRoot, 'data'))}[\\\\/].*`),
  new RegExp(`^${escaped(path.join(workspaceRoot, 'logs'))}[\\\\/].*`),
  new RegExp(`^${escaped(path.join(workspaceRoot, '.venv'))}[\\\\/].*`),
  new RegExp(`^${escaped(path.join(workspaceRoot, '.git'))}[\\\\/].*`),
];

// Package exports field support — без этого `@mushroom-map/tokens/native`
// не резолвится потому что src/native.ts маппится через
// "./native": "./src/native.ts" в exports field.
config.resolver.unstable_enablePackageExports = true;

// Bundled offline assets: forest/basemap PMTiles + glyph PBF.
config.resolver.assetExts = [
  ...config.resolver.assetExts,
  'pmtiles',
  'pbf',
];

module.exports = config;
