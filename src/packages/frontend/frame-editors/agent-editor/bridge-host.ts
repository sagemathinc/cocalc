/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Bridge host: handles postMessage requests from the iframe app and
proxies them to the CoCalc project via conat APIs.

The iframe app includes cocalc-app-bridge.js which sends typed
messages; this module processes them and sends responses back.

NOTE on file access scope: readFile, writeFile, deleteFile, listFiles,
and exec intentionally allow access to the entire project filesystem.
The security boundary in CoCalc is the *project* itself (each project
runs in its own sandboxed container).  An app embedded in a project is
expected to interact with all project files, just like a terminal or
any other editor frame can.  Path confinement within the app would
break legitimate use cases without adding meaningful security.
*/

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { exec } from "@cocalc/frontend/frame-editors/generic/client";

export type BridgeRequest =
  | {
      type: "exec";
      id: string;
      command: string;
      args?: string[];
      timeout?: number;
      path?: string;
    }
  | { type: "readFile"; id: string; path: string }
  | { type: "writeFile"; id: string; path: string; content: string }
  | { type: "deleteFile"; id: string; path: string }
  | { type: "listFiles"; id: string; path: string; hidden?: boolean }
  | { type: "kvGet"; id: string; key: string }
  | { type: "kvSet"; id: string; key: string; value: any }
  | { type: "kvDelete"; id: string; key: string }
  | { type: "kvGetAll"; id: string }
  | { type: "ping"; id: string };

export interface BridgeResponse {
  type: "bridge-response";
  id: string;
  result?: any;
  error?: string;
}

/** Direction of a bridge message relative to CoCalc. */
export type BridgeDirection = "app→host" | "host→app";

/** A single logged bridge message. */
export interface BridgeLogEntry {
  timestamp: number;
  direction: BridgeDirection;
  /** The message payload (request object, response result, or push data). */
  payload: any;
  /** For host→app responses: duration since the matching request, in ms. */
  durationMs?: number;
}

interface BridgeHostOptions {
  project_id: string;
  appDir: string;
  editorPath: string; // the .ai file path — used for exec cwd
  /** Called after each request/response pair. */
  onMessage?: (entry: BridgeLogEntry) => void;
}

/**
 * Create a message event handler that processes bridge requests
 * from the iframe and sends responses back.
 *
 * Returns a cleanup function.
 */
export function createBridgeHost(
  iframeRef: { current: HTMLIFrameElement | null },
  options: BridgeHostOptions,
): () => void {
  const { project_id, appDir: _appDir, editorPath, onMessage: onBridgeLog } =
    options;

  // App-scoped KV store (in-memory, ephemeral per session)
  const kvStore = new Map<string, any>();

  async function handleRequest(req: BridgeRequest): Promise<any> {
    switch (req.type) {
      case "ping":
        return { pong: true, timestamp: Date.now() };

      case "exec": {
        const result = await exec(
          {
            project_id,
            command: req.command,
            args: req.args ?? [],
            timeout: req.timeout ?? 30,
            max_output: 200000,
            bash: false,
            path: req.path ?? _appDir,
            err_on_exit: false,
          },
          editorPath,
        );
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exit_code,
        };
      }

      case "readFile": {
        const buf = await webapp_client.project_client.readFile({
          project_id,
          path: req.path,
        });
        return { content: buf.toString("utf8") };
      }

      case "writeFile": {
        await webapp_client.project_client.writeFile({
          project_id,
          path: req.path,
          content: req.content,
        });
        return { ok: true };
      }

      case "deleteFile": {
        const api = await webapp_client.project_client.api(project_id);
        await api.delete_files([req.path]);
        return { ok: true };
      }

      case "listFiles": {
        const api = webapp_client.conat_client.projectApi({ project_id });
        const listing = await api.system.listing({
          path: req.path,
          hidden: req.hidden,
        });
        return { files: listing };
      }

      case "kvGet":
        return { value: kvStore.get(req.key) };

      case "kvSet":
        kvStore.set(req.key, req.value);
        return { ok: true };

      case "kvDelete":
        kvStore.delete(req.key);
        return { ok: true };

      case "kvGetAll": {
        const data: { [key: string]: any } = {};
        kvStore.forEach((v, k) => {
          data[k] = v;
        });
        return { data };
      }

      default:
        throw new Error(`Unknown bridge request type: ${(req as any).type}`);
    }
  }

  function onMessage(event: MessageEvent) {
    const data = event.data;
    if (data?.type !== "cocalc-bridge-request") return;

    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    // Verify the message came from our iframe window
    if (event.source !== iframe.contentWindow) return;

    // Reject requests from unexpected origins (defense in depth).
    // The iframe loads same-origin content, so its origin must match ours.
    if (event.origin !== window.location.origin) return;

    const req: BridgeRequest = data.request;
    if (!req?.id) return;

    const targetOrigin = window.location.origin;
    const startTime = Date.now();

    // Log the incoming request
    const { id: _reqId, ...reqPayload } = req;
    onBridgeLog?.({
      timestamp: startTime,
      direction: "app→host",
      payload: reqPayload,
    });

    handleRequest(req)
      .then((result) => {
        const response: BridgeResponse = {
          type: "bridge-response",
          id: req.id,
          result,
        };
        iframe.contentWindow?.postMessage(response, targetOrigin);
        onBridgeLog?.({
          timestamp: Date.now(),
          direction: "host→app",
          payload: result,
          durationMs: Date.now() - startTime,
        });
      })
      .catch((err) => {
        const response: BridgeResponse = {
          type: "bridge-response",
          id: req.id,
          error: err?.message ?? `${err}`,
        };
        iframe.contentWindow?.postMessage(response, targetOrigin);
        onBridgeLog?.({
          timestamp: Date.now(),
          direction: "host→app",
          payload: { error: err?.message ?? `${err}` },
          durationMs: Date.now() - startTime,
        });
      });
  }

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
