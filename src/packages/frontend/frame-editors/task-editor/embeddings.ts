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

It's conceivable that somehow remote ends up slightly out of sync with what
we think.  That will be fixed next time the full init step runs.  Also,
slightly temporary issues of too much or too little data in the search index
are not "fatal data loss" for us, since this is just search.
*/

import { webapp_client } from "../../webapp-client";
import { debounce } from "lodash";
import jsonStable from "json-stable-stringify";
import sha1 from "sha1";
import { copy_with, uuidsha1 } from "@cocalc/util/misc";
import type { EmbeddingData } from "@cocalc/util/db-schema/openai";

const LIMIT = 300;

export default class Embeddings {
  private syncdb;
  private syncDoc;
  private project_id: string;
  private path: string;

  // map from point_id to hash and fragment_id for each remote element
  private remote: { [point_id: string]: EmbeddingData } = {};

  // map from point_id to Data {id,text,meta,hash} for
  // each local task
  private local: { [point_id: string]: EmbeddingData } = {};

  private initialized: boolean = false;

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
    return uuidsha1(`\\${this.url}#${fragmentId}`);
  }

  close() {
    // not sure if needed...
  }

  private async init() {
    try {
      await Promise.all([this.initRemote(), this.initLocal()]);
      this.initialized = true;
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
      const { hash, url } = payload as { hash: string; url: string };
      this.remote[id] = { hash, id: url.split("#")[1] };
    }
  }

  private toData(elt) {
    const text = elt.desc?.trim() ?? "";
    const meta = copy_with(elt, ["due_date", "done"]);
    const hash = text ? sha1(jsonStable({ ...meta, text })) : undefined;
    const id = `id=${elt.task_id}`;
    return { text, meta, hash, id };
  }

  private async initLocal() {
    Object.keys(this.local).forEach((key) => delete this.local[key]);
    this.syncDoc = this.syncdb.doc; // save doc
    this.syncdb
      .get()
      .toJS()
      .map((elt) => {
        const data = this.toData(elt);
        if (data.text) {
          this.local[this.pointId(data.id)] = data;
        }
      });
  }

  private async updateLocal() {
    if (this.syncDoc == null) {
      await this.initLocal();
      return;
    }
    // this patch encodes what changed since we last updated local:
    const patch = this.syncDoc.make_patch(this.syncdb.doc);
    for (let i = 0; i < patch.length; i += 2) {
      const operation = patch[i];
      const tasks = patch[i + 1];
      for (const { task_id } of tasks) {
        const point_id = this.pointId(`id=${task_id}`);
        if (operation == -1) {
          delete this.local[point_id];
        } else if (operation == 1) {
          const elt = this.syncdb.get_one({ task_id })?.toJS();
          if (elt != null) {
            const data = this.toData(elt);
            if (data.text) {
              this.local[point_id] = data;
            } else {
              delete this.local[point_id];
            }
          }
        }
      }
    }
  }

  private async sync() {
    if (!this.initialized) return;
    await this.updateLocal();
    await this.syncDeleteRemote();
    await this.syncSaveLocal();
  }

  // delete all remote ones that shouldn't aren't here locally.
  private async syncDeleteRemote() {
    const data: EmbeddingData[] = [];
    for (const point_id in this.remote) {
      if (this.local[point_id] === undefined) {
        data.push(this.remote[point_id]);
      }
    }
    if (data.length == 0) return;
    const ids = await webapp_client.openai_client.embeddings_remove({
      project_id: this.project_id,
      path: this.path,
      data,
    });
    // keep our view of remote in sync.
    for (const id of ids) {
      delete this.remote[id];
    }
  }

  // save all local data that isn't already saved
  private async syncSaveLocal() {
    const data: EmbeddingData[] = [];
    for (const id in this.local) {
      const remote = this.remote[id];
      if (remote === undefined || remote.hash != this.local[id].hash) {
        if (this.local[id].text) {
          //  save it
          data.push(this.local[id]);
        }
      }
    }
    const ids = await webapp_client.openai_client.embeddings_save({
      project_id: this.project_id,
      path: this.path,
      data,
    });
    for (const id of ids) {
      this.remote[id] = this.local[id];
    }
  }
}
