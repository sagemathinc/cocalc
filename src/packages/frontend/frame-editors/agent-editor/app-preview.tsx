/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
App preview panel for the .app agent editor.

Displays the application that the agent creates in an iframe.
The app files live in a hidden directory derived from the .app filename,
e.g.  foo.app  →  .foo.app.app/   which contains index.html, Python files, etc.

The iframe app can communicate with the CoCalc project via a bridge:
  - The bridge host (parent side) listens for postMessage requests
  - The bridge SDK (cocalc-app-bridge.js) provides window.cocalc API
*/

import { Button, Empty, Segmented, Spin, Tooltip } from "antd";
import { join } from "path";
import { useCallback, useEffect, useRef, useState } from "react";

import { useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { raw_url } from "@cocalc/frontend/frame-editors/frame-tree/util";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { path_split } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { EditorComponentProps } from "../frame-tree/types";
import type { AppError } from "./actions";
import { createBridgeHost } from "./bridge-host";

export function appDir(path: string): string {
  const { head, tail } = path_split(path);
  return join(head, `.${tail}.app`);
}

type AppMode = "app" | "server";

export default function AppPreview({ name }: EditorComponentProps) {
  const { project_id, path, actions } = useFrameContext();
  const [exists, setExists] = useState<boolean | null>(null);
  const [localReload, setLocalReload] = useState(0);
  const [mode, setMode] = useState<AppMode>("app");
  const [serverPort, setServerPort] = useState<number>(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dir = appDir(path);
  const indexPath = join(dir, "index.html");

  // Watch the resize counter from the store (incremented by actions.reloadAppPreview())
  const storeReload: number = useRedux(name, "resize") ?? 0;

  // Set up the bridge host for postMessage communication with the iframe
  useEffect(() => {
    const cleanup = createBridgeHost(iframeRef, {
      project_id,
      appDir: dir,
      editorPath: path,
    });
    return cleanup;
  }, [project_id, dir, path]);

  // Send init data to iframe when it signals readiness
  useEffect(() => {
    function onBridgeReady(event: MessageEvent) {
      if (event.data?.type !== "cocalc-bridge-ready") return;
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || event.source !== iframe.contentWindow)
        return;

      iframe.contentWindow.postMessage(
        {
          type: "cocalc-bridge-init",
          projectId: project_id,
          basePath: appBasePath,
        },
        "*",
      );
    }

    window.addEventListener("message", onBridgeReady);
    return () => window.removeEventListener("message", onBridgeReady);
  }, [project_id]);

  // Listen for error reports from the iframe app
  useEffect(() => {
    function onBridgeErrors(event: MessageEvent) {
      if (event.data?.type !== "cocalc-bridge-errors") return;
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || event.source !== iframe.contentWindow)
        return;
      const errors: AppError[] = (event.data.errors || []).map((e: any) => ({
        ...e,
        timestamp: Date.now(),
      }));
      if (errors.length > 0) {
        (actions as any).reportAppErrors?.(errors);
      }
    }

    window.addEventListener("message", onBridgeErrors);
    return () => window.removeEventListener("message", onBridgeErrors);
  }, [actions]);

  const checkExists = useCallback(async () => {
    try {
      await webapp_client.project_client.readFile({
        project_id,
        path: indexPath,
      });
      setExists(true);
    } catch {
      setExists(false);
    }
  }, [project_id, indexPath]);

  const reload = localReload + storeReload;

  useEffect(() => {
    checkExists();
  }, [checkExists, reload]);

  if (exists === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Spin />
      </div>
    );
  }

  if (!exists) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 20,
        }}
      >
        <Empty
          description={
            <span style={{ color: COLORS.GRAY_M }}>
              No app yet. Ask the agent to create an application and it will
              appear here.
            </span>
          }
        />
      </div>
    );
  }

  const appSrc = `${raw_url(project_id, indexPath)}?v=${reload}`;
  const serverSrc =
    serverPort > 0 ? `${appBasePath}/${project_id}/port/${serverPort}/` : "";

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: "4px 8px",
          borderBottom: `1px solid ${COLORS.GRAY_L}`,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: COLORS.GRAY_LLL,
          flexWrap: "wrap",
        }}
      >
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => setMode(v as AppMode)}
          options={[
            { value: "app", label: "App" },
            { value: "server", label: "Server" },
          ]}
        />
        <Button
          size="small"
          onClick={() => setLocalReload((n) => n + 1)}
          icon={<Icon name="refresh" />}
        >
          Reload
        </Button>
        {mode === "server" && (
          <Tooltip title="Port number of the server running in your project">
            <input
              type="number"
              min={1}
              max={65535}
              value={serverPort || ""}
              onChange={(e) => setServerPort(parseInt(e.target.value) || 0)}
              placeholder="Port..."
              style={{
                width: 80,
                height: 24,
                border: `1px solid ${COLORS.GRAY_L}`,
                borderRadius: 4,
                padding: "0 6px",
                fontSize: 12,
              }}
            />
          </Tooltip>
        )}
      </div>

      {/* Content */}
      {mode === "app" ? (
        <iframe
          ref={iframeRef}
          src={appSrc}
          style={{ flex: 1, width: "100%", border: 0 }}
          sandbox="allow-forms allow-scripts allow-presentation allow-same-origin"
        />
      ) : serverSrc ? (
        <iframe src={serverSrc} style={{ flex: 1, width: "100%", border: 0 }} />
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.GRAY_M,
          }}
        >
          Enter the port number of your running server above.
        </div>
      )}
    </div>
  );
}
