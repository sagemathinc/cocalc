export const SYNCDB_OPTIONS = {
  change_throttle: 50, // our UI/React can handle more rapid updates; plus we want output FAST.
  patch_interval: 50,
  primary_keys: ["type", "id"],
  string_cols: ["input"],
  cursors: true,
  persistent: true,
};
