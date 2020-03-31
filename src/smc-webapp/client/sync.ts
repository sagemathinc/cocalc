/*
Functionality related to Sync.
*/

import { callback2 } from "smc-util/async-utils";
import { merge } from "smc-util/misc2";
import { SyncDoc } from "smc-util/sync/editor/generic/sync-doc";

// This is mainly used for TimeTravel view...
export async function open_existing_sync_document(opts: {
  client: any;
  project_id: string;
  path: string;
  data_server?: string;
  persistent?: boolean;
}): Promise<SyncDoc|undefined> {
  const resp = await callback2(opts.client.query, {
    query: {
      syncstrings: {
        project_id: opts.project_id,
        path: opts.path,
        doctype: null,
      },
    },
  });
  if (resp.event === "error") {
    throw Error(resp.error);
  }
  if (resp.query?.syncstrings == null) {
    throw Error(`no document '${opts.path}' in project '${opts.project_id}'`);
  }
  const doctype = JSON.parse(
    resp.query.syncstrings.doctype ?? '{"type":"string"}'
  );
  let opts2 : any = {
    project_id: opts.project_id,
    path: opts.path,
  };
  if (opts.data_server) {
    opts2.data_server = opts.data_server;
  }
  if (opts.persistent) {
    opts2.persistent = opts.persistent;
  }
  if (doctype.opts != null) {
    opts2 = merge(opts2, doctype.opts);
  }
  return opts.client[`sync_${doctype.type}2`](opts2);
}
