import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile as execFile0 } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { mutagen } from "@cocalc/backend/sandbox/install";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:ssh:mutagen");

let path = "";
let version = "";
export const getMutagenAgent = reuseInFlight(
  async (): Promise<{
    path: string;
    version: string;
  }> => {
    if (path && version) {
      return { path, version };
    }

    return {
      path: "/home/wstein/build/cocalc-lite/src/packages/file-server/ssh/agent",
      // *MUST* be the same version that the project uses
      version: "0.19.0-dev",
    };
  },
);
