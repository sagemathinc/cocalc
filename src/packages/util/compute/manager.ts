export const COMPUTER_SERVER_DB_NAME = ".compute-server.syncdb";

export const SYNCDB_PARAMS = {
  path: COMPUTER_SERVER_DB_NAME,
  primary_keys: ["path"],
  ephemeral: false,
  cursors: true,
};

export const COMPUTER_SERVER_CURSOR_TYPE = "compute-server";

// This is relevant for compute servers. It's how long until we give up
// on the compute server if it doesn't actively update its cursor state.
// Note that in most cases the compute server will explicitly delete its
// cursor on termination so switching is instant. This is a "just in case",
// so things aren't broken forever, e.g., in case of a crash.
export const COMPUTE_THRESH_MS = 15 * 1000;

/*
For sync, we make the id of each compute server a uuid that is a simple
function of the id, so the client_id is stable and easy to identify.
*/

const COMPUTER_SERVER_UUID_END = "0000-4000-8000-000000000000";
export function isEncodedNumUUID(uuid: string | undefined): boolean {
  return !!uuid?.endsWith(COMPUTER_SERVER_UUID_END);
}

export function encodeIntToUUID(num: number | string): string {
  if (typeof num == "string") {
    num = parseInt(num);
  }
  // Convert to hexadecimal
  let hex = num.toString(16);
  while (hex.length < 8) {
    hex = "0" + hex;
  }
  return `${hex}-${COMPUTER_SERVER_UUID_END}`;
}

export function decodeUUIDtoNum(uuid: string): number {
  if (!isEncodedNumUUID(uuid)) {
    throw Error(`uuid is not an encoded number -- ${uuid}`);
  }
  return parseInt(uuid.slice(0, 8), 16);
}
