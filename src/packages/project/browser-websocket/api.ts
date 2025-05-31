/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * License
 */

// Websocket based request/response api.
//
// All functionality here is of the form:
//
//  -- one request
//  -- one response

import { getClient } from "@cocalc/project/client";
import { get_configuration } from "../configuration";
import { run_formatter, run_formatter_string } from "../formatters";
import { nbconvert as jupyter_nbconvert } from "../jupyter/convert";
import { jupyter_strip_notebook } from "@cocalc/jupyter/nbgrader/jupyter-parse";
import { jupyter_run_notebook } from "@cocalc/jupyter/nbgrader/jupyter-run";
import { terminal } from "@cocalc/terminal";
import { x11_channel } from "../x11/server";
import { canonical_paths } from "./canonical-path";
import { delete_files } from "@cocalc/backend/files/delete-files";
import { eval_code } from "./eval-code";
import computeFilesystemCache from "./compute-filesystem-cache";
import { move_files } from "@cocalc/backend/files/move-files";
import { rename_file } from "@cocalc/backend/files/rename-file";
import { realpath } from "./realpath";
import query from "./query";
import type { Mesg } from "@cocalc/comm/websocket/types";
import handleSyncFsApiCall, {
  handleSyncFsRequestCall,
  handleComputeServerSyncRegister,
  handleCopy,
  handleSyncFsGetListing,
  handleComputeServerDeleteFiles,
  handleComputeServerMoveFiles,
  handleComputeServerRenameFile,
  handleComputeServerComputeRegister,
} from "@cocalc/sync-fs/lib/handle-api-call";
import { version } from "@cocalc/util/smc-version";
import { getLogger } from "@cocalc/project/logger";
import execCode from "./exec-code";

const log = getLogger("websocket-api");

let primus: any = undefined;
export function init_websocket_api(_primus: any): void {
  primus = _primus;

  primus.on("connection", function (spark) {
    // Now handle the connection, which can be either from a web browser, or
    // from a compute server.
    log.debug(`new connection from ${spark.address.ip} -- ${spark.id}`);

    spark.on("request", async (data, done) => {
      log.debug("primus-api", "request", data, "REQUEST");
      const t0 = Date.now();
      try {
        const resp = await handleApiCall({ data, spark, primus });
        //log.debug("primus-api", "response", resp);
        done(resp);
      } catch (err) {
        // put this in for debugging...
        // It's normal to sometimes get errors, e.g., when a Jupyter kernel
        // isn't yet available.
        // console.trace(); log.debug("primus-api error stacktrack", err.stack, err);
        done({ error: err.toString(), status: "error" });
      }
      log.debug(
        "primus-api",
        "request",
        data,
        `FINISHED: time=${Date.now() - t0}ms`,
      );
    });
  });

  primus.on("disconnection", function (spark) {
    log.debug(
      "primus-api",
      `end connection from ${spark.address.ip} -- ${spark.id}`,
    );
  });
}

export async function handleApiCall({
  data,
  spark,
  primus,
}: {
  data: Mesg;
  spark;
  primus;
}): Promise<any> {
  const client = getClient();
  switch (data.cmd) {
    case "version":
      return version;
    case "listing":
      return await listing(data.path, data.hidden, data.compute_server_id);
    case "delete_files":
      const { compute_server_id, paths } = data;
      if (compute_server_id) {
        return await handleComputeServerDeleteFiles({
          paths,
          compute_server_id,
        });
      } else {
        return await delete_files(data.paths);
      }
    case "move_files":
      if (data.compute_server_id) {
        return await handleComputeServerMoveFiles(data);
      } else {
        return await move_files(data.paths, data.dest, (path) =>
          client.set_deleted(path),
        );
      }
    case "rename_file":
      if (data.compute_server_id) {
        return await handleComputeServerRenameFile(data);
      } else {
        return await rename_file(data.src, data.dest, (path) =>
          client.set_deleted(path),
        );
      }
    case "canonical_paths":
      return await canonical_paths(data.paths);
    case "configuration":
      return await get_configuration(data.aspect, data.no_cache);
    case "prettier": // deprecated
    case "formatter":
      return await run_formatter(data);
    case "prettier_string": // deprecated
    case "formatter_string":
      return await run_formatter_string(data);
    case "exec":
      if (data.opts == null) {
        throw Error("opts must not be null");
      }
      return await execCode(data.opts);
    case "realpath":
      return realpath(data.path);

    // todo: why?
    case "query":
      return await query(client, data.opts);
    // todo: why?
    case "eval_code":
      return await eval_code(data.code);

    case "terminal":
      return await terminal(primus, data.path, data.options);

    case "jupyter_strip_notebook":
      return await jupyter_strip_notebook(data.ipynb_path);
    case "jupyter_nbconvert":
      return await jupyter_nbconvert(data.opts);
    case "jupyter_run_notebook":
      return await jupyter_run_notebook(data.opts);

    case "x11_channel":
      return await x11_channel(client, primus, log, data.path, data.display);

    // compute server

    case "compute_filesystem_cache":
      return await computeFilesystemCache(data.opts);
    case "sync_fs":
      return await handleSyncFsApiCall(data.opts);

    case "compute_server_sync_register":
      // register filesystem container
      return await handleComputeServerSyncRegister(data.opts, spark);

    case "compute_server_compute_register":
      // register compute container
      return await handleComputeServerComputeRegister(data.opts, spark);
    case "compute_server_sync_request":
      return await handleSyncFsRequestCall(data.opts);
    case "copy_from_project_to_compute_server":
    case "copy_from_compute_server_to_project":
      return await handleCopy({ event: data.cmd, ...data.opts });
    default:
      throw Error(
        `command "${
          (data as any).cmd
        }" not implemented -- restart your project (in Project --> Settings)`,
      );
  }
}
/* implementation of the api calls */

import { DirectoryListingEntry } from "@cocalc/util/types";
import getListing from "@cocalc/backend/get-listing";
async function listing(
  path: string,
  hidden: boolean,
  compute_server_id?: number,
): Promise<DirectoryListingEntry[]> {
  if (!compute_server_id) {
    return await getListing(path, hidden);
  } else {
    return await handleSyncFsGetListing({ path, hidden, compute_server_id });
  }
}
