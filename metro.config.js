const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// drizzle-kit generates a migrations.js that imports each .sql file as a
// string, because React Native has no filesystem to read them from at runtime.
// Metro must therefore treat .sql as a source extension (D6).
config.resolver.sourceExts.push('sql');

module.exports = config;
