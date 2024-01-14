/*
Simple file server to manage sync for one specific file.


*/

import SyncClient from "@cocalc/sync-client";
import debug from "debug";

const log = debug("cocalc:compute:file-server");

export async function fileServer({ client, path }) {
  const x = new FileServer(path);
  await x.init(client);
  return x;
}

class FileServer {
  private path: string;
  private syncdoc;

  constructor(path: string) {
    this.path = path;
    this.log("constructor");
  }

  init = async (client: SyncClient) => {
    this.log("init: open_existing_sync_document");
    this.syncdoc = await client.sync_client.open_existing_sync_document({
      project_id: client.project_id,
      path: this.path,
    });
  };

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
