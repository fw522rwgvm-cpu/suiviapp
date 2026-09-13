// One schema module per domain (project tree, section 3).
// Only what a delivered slice actually uses: creating tables for features that
// do not exist yet would be a layer built "for later", which section 7 rules
// out.
export * from './setting';
export * from './nutrition';
export * from './off';
