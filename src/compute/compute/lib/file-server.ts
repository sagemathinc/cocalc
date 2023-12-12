/*
 */

import SyncClient from "@cocalc/sync-client";
import debug from "debug";

const log = debug("cocalc:compute:file-server");

export function fileServer({ client, path }) {
  return new FileServer({ client, path });
}

class FileServer {
  private path: string;
  private syncdoc;

  constructor({ client, path }: { client: SyncClient; path: string }) {
    log("creating remote file server sync session");
    this.path = path;
    this.log("constructor");
    this.syncdoc = client.sync_client.sync_string({
      project_id: client.project_id,
      path,
    });
  }

  private log = (...args) => {
    log(`FileServer("${this.path}")`, ...args);
  };

  close = async () => {
    if (this.syncdoc == null) {
      return;
    }
    this.syncdoc.close();
    delete this.syncdoc;
    this.log("close: done");
  };
}
