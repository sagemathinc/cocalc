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

import { Alert, Badge, Button, Empty, Modal, Segmented, Spin, Switch, Tooltip } from "antd";
import { join } from "path";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { raw_url } from "@cocalc/frontend/frame-editors/frame-tree/util";
import {
  delete_local_storage,
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { path_split } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { EditorComponentProps } from "../frame-tree/types";
import type { AppError } from "./actions";
import { createBridgeHost, type BridgeLogEntry } from "./bridge-host";
import { getBridgeSDKSource } from "./cocalc-app-bridge";

export function appDir(path: string): string {
  const { head, tail } = path_split(path);
  return join(head, `.${tail}.app`);
}

/** Maximum number of bridge log entries to keep in memory. */
const MAX_BRIDGE_LOG = 1000;

function trustKey(project_id: string, path: string): string {
  return `${project_id}:${path}:trust`;
}
function isAppTrusted(project_id: string, path: string): boolean {
  return !!get_local_storage(trustKey(project_id, path));
}
function setAppTrusted(project_id: string, path: string, trust: boolean) {
  if (trust) {
    set_local_storage(trustKey(project_id, path), "true");
  } else {
    delete_local_storage(trustKey(project_id, path));
  }
}

type AppMode = "app" | "server";

export default function AppPreview({ name }: EditorComponentProps) {
  const intl = useIntl();
  const { project_id, path, actions, isVisible } = useFrameContext();
  const [exists, setExists] = useState<boolean | null>(null);
  const [localReload, setLocalReload] = useState(0);
  const [mode, setMode] = useState<AppMode>("app");
  const [serverPort, setServerPort] = useState<number>(0);
  const [trust, setTrust0] = useState<boolean>(isAppTrusted(project_id, path));
  const setTrust = (v: boolean) => {
    setAppTrusted(project_id, path, v);
    setTrust0(v);
  };
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dir = appDir(path);
  const indexPath = join(dir, "index.html");

  // Bridge message log — last MAX_BRIDGE_LOG entries
  const messageLogRef = useRef<BridgeLogEntry[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [showMessages, setShowMessages] = useState(false);

  // Watch the dedicated app reload counter (not the editor's resize counter,
  // which fires on splitter drags and window resizes).
  const storeReload: number = useRedux(name, "app_reload") ?? 0;

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

  // Send init data to iframe when it signals readiness.
  // Also send proactively on iframe load, because the SDK fires
  // "cocalc-bridge-ready" synchronously at script execution time —
  // on fast/cached loads it can arrive before this listener is registered.
  const sendBridgeInit = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: "cocalc-bridge-init",
        projectId: project_id,
        basePath: appBasePath,
      },
      "*",
    );
  }, [project_id]);

  useEffect(() => {
    function onBridgeReady(event: MessageEvent) {
      if (event.data?.type !== "cocalc-bridge-ready") return;
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || event.source !== iframe.contentWindow)
        return;
      sendBridgeInit();
    }

    window.addEventListener("message", onBridgeReady);
    return () => window.removeEventListener("message", onBridgeReady);
  }, [sendBridgeInit]);

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
      // Write bridge SDK BEFORE showing the iframe — otherwise the
      // iframe loads index.html and tries to <script src="cocalc-app-bridge.js">
      // before the file exists on disk.
      try {
        await webapp_client.project_client.writeFile({
          project_id,
          path: join(dir, "cocalc-app-bridge.js"),
          content: getBridgeSDKSource(),
        });
      } catch {
        // non-fatal
      }
      setExists(true);
    } catch {
      setExists(false);
    }
  }, [project_id, indexPath, dir]);

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
        <div style={{ flex: 1 }} />
        <Tooltip
          title={intl.formatMessage({
            id: "frame-editors.agent-editor.app-preview.trust.tooltip",
            defaultMessage:
              "Trust this app to allow JavaScript execution. Untrusted apps are blocked from running.",
          })}
        >
          <Switch
            checked={trust}
            onChange={setTrust}
            checkedChildren={intl.formatMessage({
              id: "frame-editors.agent-editor.app-preview.trust.on",
              defaultMessage: "Trusted",
            })}
            unCheckedChildren={intl.formatMessage({
              id: "frame-editors.agent-editor.app-preview.trust.off",
              defaultMessage: "Untrusted",
            })}
          />
        </Tooltip>
      </div>

      {/* Trust warning */}
      {!trust && exists && (
        <Alert
          type="warning"
          showIcon
          banner
          message={intl.formatMessage({
            id: "frame-editors.agent-editor.app-preview.trust.warning",
            defaultMessage:
              "This app is not trusted. Enable trust to evaluate it.",
          })}
        />
      )}

      {/* Content */}
      {mode === "app" && !trust ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.GRAY_M,
            padding: 20,
            textAlign: "center",
          }}
        >
          <span>
            <FormattedMessage
              id="frame-editors.agent-editor.app-preview.trust.blocked"
              defaultMessage="Switch on <b>Trusted</b> in the toolbar above to run this app."
            />
          </span>
        </div>
      ) : mode === "app" ? (
        <iframe
          ref={iframeRef}
          src={appSrc}
          style={{ flex: 1, width: "100%", border: 0 }}
          sandbox="allow-forms allow-scripts allow-presentation allow-same-origin"
          onLoad={sendBridgeInit}
        />
      ) : serverSrc ? (
        <iframe
          key={reload}
          src={serverSrc}
          style={{ flex: 1, width: "100%", border: 0 }}
        />
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

/** Single row in the bridge messages table — holds its own expanded state. */
function BridgeMessageRow({ entry, index }: { entry: BridgeLogEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const { direction, payload, timestamp, durationMs } = entry;
  const time = new Date(timestamp).toLocaleTimeString();
  const isAppToHost = direction === "app→host";
  const isError = !isAppToHost && payload?.error != null;

  const arrowColor = isAppToHost
    ? "#1677ff"
    : isError
      ? "#ff4d4f"
      : "#52c41a";
  const rowBg = isAppToHost
    ? "#e8f4fd"
    : isError
      ? "#fef0ef"
      : "#f0f9eb";

  const jsonStr = expanded
    ? JSON.stringify(payload, null, 2)
    : JSON.stringify(payload);

  return (
    <tr style={{ background: rowBg, verticalAlign: "top" }}>
      {/* # + direction arrow */}
      <td
        style={{
          padding: "4px 6px",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
          color: COLORS.GRAY_M,
          fontSize: 12,
        }}
      >
        {index + 1}{" "}
        <span style={{ color: arrowColor, fontWeight: "bold" }}>
          {isAppToHost ? "→" : "←"}
        </span>
      </td>
      {/* time + duration */}
      <td
        style={{
          padding: "4px 6px",
          whiteSpace: "nowrap",
          fontSize: 11,
          color: COLORS.GRAY_M,
        }}
      >
        {time}
        {durationMs != null && (
          <span style={{ marginLeft: 4 }}>({durationMs}ms)</span>
        )}
      </td>
      {/* JSON body with expand toggle */}
      <td style={{ padding: "4px 6px", width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 4,
            fontFamily: "monospace",
            fontSize: 12,
            wordBreak: "break-all",
          }}
        >
          <span
            onClick={() => setExpanded(!expanded)}
            style={{
              cursor: "pointer",
              userSelect: "none",
              flexShrink: 0,
              color: COLORS.GRAY_M,
              lineHeight: "18px",
            }}
          >
            <Icon name={expanded ? "caret-down" : "caret-right"} />
          </span>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              whiteSpace: expanded ? "pre-wrap" : "nowrap",
              overflow: expanded ? "auto" : "hidden",
              textOverflow: expanded ? undefined : "ellipsis",
              maxHeight: expanded ? 400 : undefined,
            }}
          >
            {jsonStr}
          </div>
        </div>
      </td>
    </tr>
  );
}

function BridgeMessagesModal({
  onClose,
  messages,
}: {
  onClose: () => void;
  messages: BridgeLogEntry[];
}) {
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: "0 3px",
        }}
      >
        <thead>
          <tr style={{ fontSize: 11, color: COLORS.GRAY_M, textAlign: "left" }}>
            <th style={{ padding: "2px 6px", whiteSpace: "nowrap" }}>#</th>
            <th style={{ padding: "2px 6px", whiteSpace: "nowrap" }}>Time</th>
            <th style={{ padding: "2px 6px" }}>Payload</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((entry, i) => (
            <BridgeMessageRow key={i} entry={entry} index={i} />
          ))}
        </tbody>
      </table>
      <div ref={listEndRef} />
    </Modal>
  );
}
