/*
Support legacy TimeTravel history from before the switch to NATS.
*/

import { type Client } from "./types";
import { type DB } from "@cocalc/nats/hub-api/db";

export class LegacyHistory {
  private db: DB;
  private project_id: string;
  private path: string;

  constructor({
    client,
    project_id,
    path,
  }: {
    client: Client;
    project_id: string;
    path: string;
  }) {
    // this is only available on the frontend browser, which is all that matters.
    this.db = (client as any).nats_client?.hub.db as any;
    this.project_id = project_id;
    this.path = path;
  }

  // Returns '' if no legacy data.  Returns sha1 hash of blob
  // with the legacy data if there is legacy data.
  private blobId?: string;
  getBlobId = async (): Promise<string> => {
    if (this.blobId == null) {
      this.blobId = await this.db.getLegacyTimeTravelBlobId({
        project_id: this.project_id,
        path: this.path,
      });
    }
    return this.blobId!;
  };

  getPatches = async () => {
    const s = await this.db.getLegacyTimeTravelPatches({
      uuid: await this.getBlobId(),
    });
    return JSON.parse(s).patches;
  };
}
