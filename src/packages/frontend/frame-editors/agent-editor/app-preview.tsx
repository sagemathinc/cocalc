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

import { Badge, Button, Empty, List, Modal, Segmented, Spin, Tooltip } from "antd";
import { join } from "path";
import { useCallback, useEffect, useRef, useState } from "react";

import { useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { raw_url } from "@cocalc/frontend/frame-editors/frame-tree/util";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { path_split } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { EditorComponentProps } from "../frame-tree/types";
import type { AppError } from "./actions";
import { createBridgeHost, type BridgeLogEntry } from "./bridge-host";

export function appDir(path: string): string {
  const { head, tail } = path_split(path);
  return join(head, `.${tail}.app`);
}

/** Maximum number of bridge log entries to keep in memory. */
const MAX_BRIDGE_LOG = 1000;

type AppMode = "app" | "server";

export default function AppPreview({ name }: EditorComponentProps) {
  const { project_id, path, actions, isVisible } = useFrameContext();
  const [exists, setExists] = useState<boolean | null>(null);
  const [localReload, setLocalReload] = useState(0);
  const [mode, setMode] = useState<AppMode>("app");
  const [serverPort, setServerPort] = useState<number>(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dir = appDir(path);
  const indexPath = join(dir, "index.html");

  // Bridge message log — last MAX_BRIDGE_LOG entries
  const messageLogRef = useRef<BridgeLogEntry[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [showMessages, setShowMessages] = useState(false);

  // Watch the resize counter from the store (incremented by actions.reloadAppPreview())
  const storeReload: number = useRedux(name, "resize") ?? 0;

  // Set up the bridge host for postMessage communication with the iframe
  useEffect(() => {
    const cleanup = createBridgeHost(iframeRef, {
      project_id,
      appDir: dir,
      editorPath: path,
      onMessage: (entry) => {
        const log = messageLogRef.current;
        log.push(entry);
        if (log.length > MAX_BRIDGE_LOG) {
          log.splice(0, log.length - MAX_BRIDGE_LOG);
        }
        setMessageCount(log.length);
      },
    });
    return () => {
      cleanup();
      messageLogRef.current = [];
      setMessageCount(0);
    };
  }, [project_id, dir, path]);

  // Send show/hide push messages when tab visibility changes
  const prevVisibleRef = useRef<boolean | null>(null);
  useEffect(() => {
    // Skip initial mount — only fire on actual transitions
    if (prevVisibleRef.current === null) {
      prevVisibleRef.current = isVisible;
      return;
    }
    if (isVisible === prevVisibleRef.current) return;
    prevVisibleRef.current = isVisible;

    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    const msgType = isVisible ? "cocalc-bridge-show" : "cocalc-bridge-hide";
    iframe.contentWindow.postMessage({ type: msgType }, "*");

    // Log it
    const entry: BridgeLogEntry = {
      timestamp: Date.now(),
      direction: "host→app",
      payload: { type: msgType },
    };
    const log = messageLogRef.current;
    log.push(entry);
    if (log.length > MAX_BRIDGE_LOG) log.splice(0, log.length - MAX_BRIDGE_LOG);
    setMessageCount(log.length);
  }, [isVisible]);

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
          onClick={() => {
            messageLogRef.current = [];
            setMessageCount(0);
            setLocalReload((n) => n + 1);
          }}
          icon={<Icon name="refresh" />}
        >
          Reload
        </Button>
        <Badge count={messageCount} size="small" offset={[-4, 0]} color={COLORS.GRAY_M}>
          <Button
            size="small"
            onClick={() => setShowMessages(true)}
            icon={<Icon name="comment" />}
            disabled={messageCount === 0}
          >
            Messages
          </Button>
        </Badge>
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
      {showMessages && (
        <BridgeMessagesModal
          onClose={() => setShowMessages(false)}
          messages={messageLogRef.current}
        />
      )}
    </div>
  );
}

const MSG_BASE: React.CSSProperties = {
  borderRadius: 6,
  padding: "6px 10px",
  marginBottom: 4,
  fontFamily: "monospace",
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  maxHeight: 200,
  overflow: "auto",
};

// App → Host (request from iframe)
const APP_TO_HOST_STYLE: React.CSSProperties = {
  ...MSG_BASE,
  background: "#e8f4fd",
};

// Host → App (success response)
const HOST_TO_APP_STYLE: React.CSSProperties = {
  ...MSG_BASE,
  background: "#f0f9eb",
};

// Host → App (error response)
const HOST_TO_APP_ERR_STYLE: React.CSSProperties = {
  ...MSG_BASE,
  background: "#fef0ef",
};

function BridgeMessagesModal({
  onClose,
  messages,
}: {
  onClose: () => void;
  messages: BridgeLogEntry[];
}) {
  const listEndRef = useRef<HTMLDivElement>(null);
  const siteName = useTypedRedux("customize", "site_name") ?? "CoCalc";

  useEffect(() => {
    // Scroll to bottom after modal opens
    setTimeout(() => listEndRef.current?.scrollIntoView(), 100);
  }, []);

  return (
    <Modal
      title={`Bridge Messages (${messages.length})`}
      open
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          OK
        </Button>
      }
      width="85vw"
      styles={{ body: { maxHeight: "60vh", overflow: "auto" } }}
    >
      <List
        size="small"
        dataSource={messages}
        renderItem={(entry, i) => {
          const { direction, payload, timestamp, durationMs } = entry;
          const time = new Date(timestamp).toLocaleTimeString();
          const isAppToHost = direction === "app→host";
          const isError = !isAppToHost && payload?.error != null;
          const style = isAppToHost
            ? APP_TO_HOST_STYLE
            : isError
              ? HOST_TO_APP_ERR_STYLE
              : HOST_TO_APP_STYLE;
          const label = isAppToHost
            ? `App → ${siteName}`
            : `${siteName} → App`;
          const labelColor = isAppToHost
            ? "#1677ff"
            : isError
              ? "#ff4d4f"
              : "#52c41a";
          return (
            <List.Item
              style={{ display: "block", padding: "2px 0", border: "none" }}
            >
              <div style={style}>
                <div
                  style={{
                    fontSize: 10,
                    color: COLORS.GRAY_M,
                    marginBottom: 2,
                  }}
                >
                  #{i + 1} &mdash; {time}
                  {durationMs != null ? ` (${durationMs}ms)` : ""}
                </div>
                <span style={{ fontWeight: "bold", color: labelColor }}>
                  {label}:
                </span>{" "}
                {JSON.stringify(payload, null, 2)}
              </div>
            </List.Item>
          );
        }}
      />
      <div ref={listEndRef} />
    </Modal>
  );
}
