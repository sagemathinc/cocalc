/*
Support legacy TimeTravel history from before the switch to NATS.
*/

import { type Client } from "./types";
import { type DB } from "@cocalc/nats/hub-api/db";

export interface LegacyPatch {
  time: Date;
  patch: string;
  user_id: number;
  snapshot?: string;
  sent?: Date; // when patch actually sent, which may be later than when made
  prev?: Date; // timestamp of previous patch sent from this session
  size: number; // size of the patch (by defn length of string representation)
}

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
  private info?: { uuid: string; users?: string[] };
  getInfo = async (): Promise<{ uuid: string; users?: string[] }> => {
    if (this.info == null) {
      this.info = await this.db.getLegacyTimeTravelInfo({
        project_id: this.project_id,
        path: this.path,
      });
    }
    return this.info!;
  };

  getPatches = async (): Promise<{
    patches: LegacyPatch[];
    users: string[];
  }> => {
    const info = await this.getInfo();
    if (!info.uuid || !info.users) {
      return { patches: [], users: [] };
    }
    const s = await this.db.getLegacyTimeTravelPatches({
      uuid: info.uuid,
    });
    return { patches: JSON.parse(s).patches, users: info.users };
  };
}
