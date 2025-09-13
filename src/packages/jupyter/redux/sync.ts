export const SYNCDB_OPTIONS = {
  change_throttle: 25,
  patch_interval: 25,
  primary_keys: ["type", "id"],
  string_cols: ["input"],
  cursors: true,
  persistent: true,
  noSaveToDisk: true,
};
