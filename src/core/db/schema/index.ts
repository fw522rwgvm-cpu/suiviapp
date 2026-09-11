// One schema module per domain (project tree, section 3).
// Slice 0 only needs settings: creating tables for features that do not exist
// yet would be a layer built "for later", which section 7 rules out.
export * from './setting';
