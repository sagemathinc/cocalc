// This file is purely to give HtmlWebpackPlugin an opportunity to pick up these const values
// In any other place, import from the main schema file

// these times in minutes are used for active/recently edited projects and accounts in postgres-server-queries.coffee's get_stats
exports.RECENT_TIMES = {
  active: 5,
  last_hour: 60,
  last_day: 60 * 24,
  last_week: 60 * 24 * 7,
  last_month: 60 * 24 * 30
};

// this translates the semantic meanings to the keys used in the DB, also prevents typos!
exports.RECENT_TIMES_KEY = {
  active: "5min",
  last_hour: "1h",
  last_day: "1d",
  last_week: "7d",
  last_month: "30d"
};

const upgrade_spec = require("./upgrade-spec");
exports.DEFAULT_QUOTAS = upgrade_spec.DEFAULT_QUOTAS;