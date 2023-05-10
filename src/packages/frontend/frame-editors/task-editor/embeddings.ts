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

export class SyncEmbeddings {
  constructor(
    private project_id: string,
    private path: string,
    private syncdb: string
  ) {
    this.init();
  }

  private async init() {
    await Promise.all([this.updateRemote(), this.updateLocal()]);
  }

  private async updateRemote() {
    // todo: limit, dealing with offset.
    const remote = await webapp_client.openai_client.embeddings_search({
      limit: 300,
      selector: { include: ["hash"] },
      scope: `projects/${this.project_id}/files/${this.path}#`,
    });
  }

  private async updateLocal() {
    console.log("updateLocal: todo");
  }
}
