// Function to make one:
exports.synctable = require("./global-cache").synctable;

// Type of it.
exports.SyncTable = require('./synctable').SyncTable;

exports.synctable_no_changefeed = require('./synctable-no-changefeed').synctable_no_changefeed;

exports.synctable_no_database = require('./synctable-no-database').synctable_no_database;
