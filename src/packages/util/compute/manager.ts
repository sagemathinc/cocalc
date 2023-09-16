export const COMPUTER_SERVER_DB_NAME = ".compute-server.syncdb";

export const SYNCDB_PARAMS = {
  path: COMPUTER_SERVER_DB_NAME,
  primary_keys: ["id", "table"],
  ephemeral: true, // do NOT need to store state longterm in any database, obviously!
};
