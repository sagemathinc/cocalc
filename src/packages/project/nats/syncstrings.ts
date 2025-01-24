import getConnection from "./connection";
import { project_id } from "@cocalc/project/data";
import { JSONCodec } from "nats";
import { sha1 } from "@cocalc/backend/sha1";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { SyncStrings } from "@cocalc/util/nats/syncstrings";

const jc = JSONCodec();

let _syncstrings: null | SyncStrings;
const syncstrings = reuseInFlight(async () => {
  if (_syncstrings == null) {
    const nc = await getConnection();
    _syncstrings = new SyncStrings({ sha1, jc, nc, project_id });
    await _syncstrings.init();
  }
  return _syncstrings!;
});
export default syncstrings;
