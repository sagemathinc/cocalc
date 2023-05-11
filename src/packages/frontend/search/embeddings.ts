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

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { redux } from "@cocalc/frontend/app-framework";
import { debounce } from "lodash";
import jsonStable from "json-stable-stringify";
import sha1 from "sha1";
import { close, copy_with, uuidsha1 } from "@cocalc/util/misc";
import type { EmbeddingData } from "@cocalc/util/db-schema/openai";
import type { SyncDB } from "@cocalc/sync/editor/db";
import type { Document } from "@cocalc/sync/editor/generic/types";
import { MAX_SEARCH_LIMIT } from "@cocalc/util/db-schema/openai";

// TODO: do something better.  The fallout of exceeding the limit
// is that some extra stuff will just keep saving every time.
// So everything works, but it is less efficient.
// Fix is just to use offset and paging for initial query.
const LIMIT = MAX_SEARCH_LIMIT;

interface Options {
  project_id: string;
  path: string;
  syncdb: SyncDB;
  primaryKey: string;
  textColumn: string;
  metaColumns?: string[];
  transform?: (elt: object) => undefined | object;
}

export default function embeddings(opts: Options): Embeddings {
  return new Embeddings(opts);
}

class Embeddings {
  private syncdb: SyncDB;
  private syncDoc?: Document;
  private project_id: string;
  private path: string;
  private primaryKey: string; // primary key of the syncdb; so at least this fragment should work:  "id={obj[primary]}"
  private textColumn: string; // the name of the column that has the text that gets indexed
  private metaColumns?: string[]; // the names of the metadata columns
  private transform?: (elt: object) => undefined | object;

  // map from point_id to hash and fragment_id for each remote element
  private remote: { [point_id: string]: EmbeddingData } = {};

  // map from point_id to Data {id,text,meta,hash} for
  // each local task
  private local: { [point_id: string]: EmbeddingData } = {};

  private initialized: boolean = false;

  private url: string;

  constructor({
    project_id,
    path,
    syncdb,
    primaryKey,
    textColumn,
    metaColumns,
    transform,
  }: Options) {
    this.syncdb = syncdb;
    this.project_id = project_id;
    this.path = path;
    this.primaryKey = primaryKey;
    this.textColumn = textColumn;
    this.metaColumns = metaColumns;
    this.transform = transform;
    this.url = `projects/${project_id}/files/${path}`;
    if (!this.isEnabled()) {
      // if disabled we just never do anything.
      return;
    }
    syncdb.once("change", () => this.init());
    syncdb.on("change", debounce(this.sync.bind(this), 5000));
    syncdb.once("closed", () => {
      close(this);
    });
  }

  pointId(fragmentId: string): string {
    return uuidsha1(`\\${this.url}#${fragmentId}`);
  }

  isEnabled(): boolean {
    // for now -- we may want to do something more finegrained later.
    return redux.getStore("projects").hasOpenAI(this.project_id);
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
    const text = elt[this.textColumn]?.trim() ?? "";
    let meta, hash;
    if (this.metaColumns != null && this.metaColumns.length > 0) {
      meta = copy_with(elt, this.metaColumns);
      hash = text ? sha1(jsonStable({ ...meta, text })) : undefined;
    } else {
      meta = undefined;
      hash = text ? sha1(text) : undefined;
    }
    const id = `id=${elt[this.primaryKey]}`;
    return { text, meta, hash, id };
  }

  private async initLocal() {
    Object.keys(this.local).forEach((key) => delete this.local[key]);
    this.syncDoc = this.syncdb.get_doc(); // save doc so we can tell what changed later
    this.syncdb
      .get()
      .toJS()
      .map((elt) => {
        if (this.transform) {
          elt = this.transform(elt);
          if (elt == null) return;
        }
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
    const patch = this.syncDoc.make_patch(this.syncdb.get_doc());
    for (let i = 0; i < patch.length; i += 2) {
      const operation = patch[i];
      const tasks = patch[i + 1];
      for (const task of tasks) {
        const id = task[this.primaryKey];
        const point_id = this.pointId(`id=${id}`);
        if (operation == -1) {
          delete this.local[point_id];
        } else if (operation == 1) {
          let elt = this.syncdb.get_one({ [this.primaryKey]: id })?.toJS();
          if (elt != null) {
            if (this.transform) {
              elt = this.transform(elt);
              if (elt == null) continue;
            }
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
    if (!this.initialized) return;
    await this.syncDeleteRemote();
    if (!this.initialized) return;
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
    if (this.remote == null) {
      // nothing to do -- probably closed during the above async call.
      return;
    }
    // keep our view of remote in sync.
    for (const id of ids) {
      delete this.remote[id];
    }
    console.log("embeddings -- deleted", ids);
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
    if (this.remote == null || this.local == null) {
      // nothing to do -- probably closed during the above async call.
      return;
    }
    console.log("embeddings -- saved", ids);
    for (const id of ids) {
      this.remote[id] = this.local[id];
    }
  }
}
