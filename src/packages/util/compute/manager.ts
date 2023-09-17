export const COMPUTER_SERVER_DB_NAME = ".compute-server.syncdb";

export const SYNCDB_PARAMS = {
  path: COMPUTER_SERVER_DB_NAME,
  primary_keys: ["path"],
  ephemeral: true, // do NOT need to store state longterm in any database.
  cursors: true,
};

/*
For sync, we make the id of each compute server a uuid that is a simple
function of the id, so the client_id is stable and easy to identify.
*/

const CONSTANT_PART = "0000-4000-8000-000000000000";
export function encodeIntToUUID(num: number): string {
  // Convert to hexadecimal
  let hex = num.toString(16);
  while (hex.length < 8) {
    hex = "0" + hex;
  }
  return `${hex}-${CONSTANT_PART}`;
}

export function decodeUUIDtoNum(uuid: string): number {
  if (!uuid.endsWith(CONSTANT_PART)) {
    throw Error(`uuid is not an encoded number -- ${uuid}`);
  }
  return parseInt(uuid.slice(0, 8), 16);
}
