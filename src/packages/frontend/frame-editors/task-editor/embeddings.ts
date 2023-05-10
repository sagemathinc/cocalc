/*
Sync embeddings with vector database.

There are two steps:

1. Initialization:
  - Remote: Query to get the id's and hashes of all embeddings associated
    to this document that are currently stored in the vector database
  - Local: Compute the id's, payloads, and hashes for this document.

2. Sync: We remove/save data so that what is stored in the vector database
matches the current state of the document here.  This is done periodically
as the document changes.  If multiple editors are editing the document they
might both do this right now, but that doesn't cause any harm since its
idempotent.  We do this as follows:
  - Update local view of things
  - Do remove and save operations
  - Update our view of what remote knows.

It's coneivable that somehow remote ends up slightly out of sync with what
we think.  That will be fixed next time the full init step runs.  Also,
slightly temporary issues of too much or too little data in the search index
are not "fatal data loss" for us, since this is just search.
*/

// console.log(JSON.stringify(await cc.client.openai_client.embeddings_search({limit:3, selector:{include:['hash']}, filter:{must:[{key:"path",match:{value:'foo bar/x /a.tasks'}}]}}),0,2))

import { webapp_client } from "../../webapp-client";
import { debounce } from "lodash";
import jsonStable from "json-stable-stringify";
import sha1 from "sha1";
import { copy_with, uuidsha1 } from "@cocalc/util/misc";
import type { EmbeddingData } from "@cocalc/util/db-schema/openai";

const LIMIT = 300;

export default class Embeddings {
  private syncdb;
  private project_id: string;
  private path: string;

  // map from point_id to hash and fragment_id for each remote element
  private remote: { [point_id: string]: { hash: string; url: string } } = {};

  // map from point_id to Data {id,text,meta,hash} for
  // each local task
  private local: { [point_id: string]: EmbeddingData } = {};

  private url: string;

  constructor({ project_id, path, syncdb }) {
    this.syncdb = syncdb;
    this.project_id = project_id;
    this.path = path;
    this.url = `projects/${project_id}/files/${path}`;
    syncdb.once("change", () => this.init());
    syncdb.on("change", debounce(this.sync.bind(this), 5000));
  }

  pointId(fragmentId: string): string {
    return uuidsha1(`${this.url}#${fragmentId}`);
  }

  close() {
    // not sure if needed...
  }

  private async init() {
    try {
      await Promise.all([this.initRemote(), this.initLocal()]);
      this.sync();
    } catch (err) {
      console.warn(
        `WARNING: issue initializing embeddings for ${this.url}: ${err}`
      );
    }
  }

  private async initRemote() {
    // todo: limit, dealing with offset.
    const remote = await webapp_client.openai_client.embeddings_search({
      scope: `${this.url}#`, // hash so don't get data for files that start with the same filename
      selector: { include: ["hash", "url"] },
      limit: LIMIT,
    });
    // empty current this.remote:
    Object.keys(this.remote).forEach((key) => delete this.remote[key]);
    for (const { id, payload } of remote) {
      this.remote[id] = payload as any;
    }
  }

  private async initLocal() {
    Object.keys(this.local).forEach((key) => delete this.local[key]);
    this.syncdb
      .get()
      .toJS()
      .map((obj) => {
        const text = obj.desc;
        const meta = copy_with(obj, ["due_date", "done"]);
        const hash = sha1(jsonStable({ ...meta, text }));
        const id = `id=${obj.task_id}`;
        this.local[this.pointId(id)] = { id, text, meta, hash };
      });
  }

  private async sync() {
    await this.syncDeleteRemote();
  }

  private async syncDeleteRemote() {
    // delete all remote ones that shouldn't be there.
    const data: EmbeddingData[] = [];
    for (const id in this.remote) {
      if (this.local[id] === undefined) {
        const { url } = this.remote[id];
        data.push({ id: url.split("#")[1] });
      }
    }
    console.log("data = ", data);
    if (data.length == 0) return;
    const ids = await webapp_client.openai_client.embeddings_remove({
      project_id: this.project_id,
      path: this.path,
      data,
    });
    console.log("removed ", ids);
  }
}
