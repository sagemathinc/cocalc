/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Saving blobs to hub
*/

import { getLogger } from "@cocalc/backend/logger";
import * as message from "@cocalc/util/message";
import { defaults, required, uuid } from "@cocalc/util/misc";
import { CB } from "@cocalc/util/types/database";

const winston = getLogger("blobs");

type BlobCB = CB<any, { sha1: string; error: string }>;

type CBEntry = [BlobCB, string];

const _save_blob_callbacks: { [key: string]: CBEntry[] } = {};

interface Opts {
  sha1: string;
  cb: BlobCB;
  timeout?: number;
}

export function receive_save_blob_message(opts: Opts): void {
  // temporarily used by file_session_manager
  opts = defaults(opts, {
    sha1: required,
    cb: required,
    timeout: 30, // seconds; maximum time in seconds to wait for response message
  });
  winston.debug(`receive_save_blob_message: ${opts.sha1}`);
  const { sha1 } = opts;
  const id = uuid();
  _save_blob_callbacks[sha1] ??= [];
  _save_blob_callbacks[sha1].push([opts.cb, id]);

  // Timeout functionality -- send a response after opts.timeout seconds,
  // in case no hub responded.
  if (!opts.timeout) {
    return;
  }

  const f = function (): void {
    const v = _save_blob_callbacks[sha1];
    if (v != null) {
      const mesg = message.save_blob({
        sha1,
        error: `timed out after local hub waited for ${opts.timeout} seconds`,
      });

      const w: CBEntry[] = [];
      for (let x of v) {
        // this is O(n) instead of O(1), but who cares since n is usually 1.
        if (x[1] === id) {
          x[0](mesg);
        } else {
          w.push(x);
        }
      }

      if (w.length === 0) {
        delete _save_blob_callbacks[sha1];
      } else {
        _save_blob_callbacks[sha1] = w;
      }
    }
  };

  setTimeout(f, opts.timeout * 1000);
}

export function handle_save_blob_message(mesg): void {
  winston.debug(`handle_save_blob_message: ${mesg.sha1}`);
  const v = _save_blob_callbacks[mesg.sha1];
  if (v != null) {
    for (let x of v) {
      x[0](mesg);
    }
    delete _save_blob_callbacks[mesg.sha1];
  }
}
