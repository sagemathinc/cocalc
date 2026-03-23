/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Agent conversation panel for the .ai editor.

The user talks to the agent which creates an application in the
hidden app directory.  The agent can create/modify files and the
result is shown in the AppPreview panel on the right.

Features:
- Multi-language code execution (Python, R, Julia, etc.)
- UV-based Python environment management
- Sibling file context awareness
- App error capture and auto-feedback
- Session management via shared AgentSessionBar
- Auto-apply writeFile blocks
*/

import { join } from "path";

import { Alert, Button, Spin, Tooltip } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux, useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";
import type { CSS } from "@cocalc/frontend/app-framework";
import { LLMCostEstimationChat } from "@cocalc/frontend/chat/llm-cost-estimation";
import type { CostEstimate } from "@cocalc/frontend/chat/types";
import { Icon, Paragraph } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { AgentInputArea } from "@cocalc/frontend/frame-editors/llm/agent-base/agent-input-area";
import { AgentSessionBar } from "@cocalc/frontend/frame-editors/llm/agent-base/agent-session-bar";
import { RenameModal } from "@cocalc/frontend/frame-editors/llm/agent-base/rename-modal";
import { useAutoNameSession } from "@cocalc/frontend/frame-editors/llm/agent-base/use-auto-name-session";
import type { AgentSession } from "@cocalc/frontend/frame-editors/llm/agent-base/types";
import { calcMinMaxEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { isFreeModel } from "@cocalc/util/db-schema/llm-utils";
import { path_split, uuid } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { EditorComponentProps } from "../frame-tree/types";
import { appDir } from "./app-preview";
import { getBridgeSDKSource } from "./cocalc-app-bridge";
import type { AppError } from "./actions";
import type { ServerVerb } from "./actions";
import { applySearchReplace } from "../llm/coding-agent-utils";
import LLMSelector from "../llm/llm-selector";

interface DisplayMessage {
  sender: "user" | "assistant" | "system";
  content: string;
  date: string;
  event: string;
  account_id?: string;
}

const TAG = "ai-agent";

const CONTAINER_STYLE: CSS = {
  display: "flex",
  flexDirection: "column",
  flex: "1 1 0",
  minHeight: 0,
  overflow: "hidden",
} as const;

const MESSAGES_STYLE: CSS = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  padding: "8px 12px",
} as const;

const USER_MSG_STYLE: CSS = {
  background: COLORS.GRAY_LLL,
  borderRadius: 8,
  padding: "8px 12px",
  marginBottom: 8,
  whiteSpace: "pre-wrap",
} as const;

const ASSISTANT_MSG_STYLE: CSS = {
  marginBottom: 8,
  padding: "8px 12px",
} as const;

const SYSTEM_MSG_STYLE: CSS = {
  marginBottom: 8,
  padding: "8px 12px",
  background: COLORS.BS_GREEN_LL,
  borderRadius: 8,
  fontSize: "0.9em",
} as const;

const ERROR_MSG_STYLE: CSS = {
  marginBottom: 8,
  padding: "8px 12px",
  background: COLORS.ANTD_BG_RED_L,
  border: `1px solid ${COLORS.ANTD_BG_RED_M}`,
  borderRadius: 8,
  fontSize: "0.9em",
} as const;

/**
 * Build a system prompt for the app-building agent.
 * Includes app errors for context.
 */
function buildSystemPrompt(
  appDirectory: string,
  workingDirectory: string,
  appErrors?: AppError[],
): string {
  let prompt = `You are an AI app-building agent in CoCalc.
The user describes an application they want. You create it by writing files.

The .app file is in: ${workingDirectory || "."}
The app files go in the directory: ${appDirectory}/
The entry point must be: ${appDirectory}/index.html
Shell commands (exec blocks) run in: ${workingDirectory || "."}

## What You Can Build

You build **interactive web applications** that run inside the CoCalc project.
The app is an HTML/CSS/JS frontend displayed in an iframe, connected to the
full power of the project backend via the CoCalc bridge API.

This means you can build apps that:
- Run **Python, R, Julia, SageMath, Octave** or any other installed language
- Use **uv** to manage a local Python environment with arbitrary packages
- Read, write, and delete **any file** in the project
- Run **shell commands** (git, make, latex, compilers, package managers, etc.)
- Start **servers** (Flask, Dash, Shiny, FastAPI, etc.) and display them
- Process and analyze data, then display interactive results in the UI

### Typical pattern

1. Write backend scripts (Python, R, etc.) to the app directory
2. Write an HTML/JS frontend that uses the bridge to call those scripts
3. The user clicks a button in the UI → bridge runs the script → result is displayed

For example: a "LaTeX Statistics" app might have a Python script that parses
.tex files and counts commands, and an HTML UI with an "Update" button that
runs the script and displays a table of results.

You have three tools to build the app: **writefile** (create/overwrite files),
**search/replace** (patch existing files), and **exec** (run shell commands).

When you want to create or modify a file, use this format:

\`\`\`writefile ${appDirectory}/filename.ext
file contents here
\`\`\`

You can include multiple writefile blocks in one response.
After writing files, the app preview will automatically reload.

For small edits to existing files, prefer search/replace blocks instead of rewriting the entire file:

<<<SEARCH ${appDirectory}/filename.ext
exact text to find
>>>REPLACE
replacement text
<<<END

The SEARCH text must match exactly (including whitespace/indentation).
You can include multiple search/replace blocks targeting different files.

When you need to run a shell command (e.g., install a package, run a Python script), use:

\`\`\`exec
command here
\`\`\`

The user will be asked to confirm before execution (unless auto-exec is enabled).

## Bridge API — Connecting the App to the Project

The app runs in an iframe. To let it interact with the CoCalc project
(read/write files, execute code, store state), include this script tag
in your HTML:

<script src="cocalc-app-bridge.js"></script>

This makes \`window.cocalc\` available with these methods:

### Shell & Code Execution

- \`cocalc.exec(command, args?, opts?)\` → \`{stdout, stderr, exit_code}\`
  Run a shell command in the project. opts: {timeout, path}

- \`cocalc.run(lang, code, opts?)\` → \`{stdout, stderr, exit_code}\`
  Run code in a supported language. lang is one of: python, R, julia,
  node, ruby, perl, bash, sh, octave, sage.

- \`cocalc.python(code, opts?)\` → \`{stdout, stderr, exit_code}\`
  Run Python code. Shortcut for exec("python3", ["-c", code]).

- \`cocalc.R(code, opts?)\` → \`{stdout, stderr, exit_code}\`
  Run R code via Rscript -e.

- \`cocalc.julia(code, opts?)\` → \`{stdout, stderr, exit_code}\`
  Run Julia code via julia -e.

- \`cocalc.make(target?, opts?)\` → \`{stdout, stderr, exit_code}\`
  Run make. opts.args for extra flags.

- \`cocalc.latexmk(file, opts?)\` → \`{stdout, stderr, exit_code}\`
  Compile a .tex file with latexmk -pdf. opts.args for extra flags.

- \`cocalc.gcc(files, opts?)\` → \`{stdout, stderr, exit_code}\`
  Compile C/C++. files is an array. opts: {output, compiler ("gcc"/"g++"), args}

### UV Python Environment (cocalc.uv)

Manage a local uv-based Python virtual environment in the app directory.
Use this when the app needs specific Python packages.

- \`cocalc.uv.init(opts?)\` → \`{stdout, stderr, exit_code}\`
  Initialize a uv project (creates pyproject.toml + .venv). opts: {pythonVersion}

- \`cocalc.uv.add(packages)\` → \`{stdout, stderr, exit_code}\`
  Add packages. packages is a string ("numpy pandas") or array.

- \`cocalc.uv.remove(packages)\` → \`{stdout, stderr, exit_code}\`
  Remove packages.

- \`cocalc.uv.sync()\` → \`{stdout, stderr, exit_code}\`
  Sync/install all declared dependencies.

- \`cocalc.uv.run(code, opts?)\` → \`{stdout, stderr, exit_code}\`
  Run Python code using the uv environment: uv run python -c "code".
  Use this instead of cocalc.python() when you need uv-managed packages.

- \`cocalc.uv.runScript(script, args?, opts?)\` → \`{stdout, stderr, exit_code}\`
  Run a Python script file: uv run python script.py

- \`cocalc.uv.exec(command, args?, opts?)\` → \`{stdout, stderr, exit_code}\`
  Run any command in the uv environment: uv run <command> [args]

- \`cocalc.uv.pip(packages, opts?)\` → \`{stdout, stderr, exit_code}\`
  Install packages via uv pip (without adding to pyproject.toml).

### File Operations

- \`cocalc.readFile(path)\` → \`{content}\`
  Read a text file from the project.

- \`cocalc.writeFile(path, content)\` → \`{ok}\`
  Write a text file to the project.

- \`cocalc.deleteFile(path)\` → \`{ok}\`
  Delete a file.

- \`cocalc.listFiles(path, opts?)\` → \`{files: [...]}\`
  List directory contents. opts: {hidden: boolean}

### Key-Value Store & Utilities

- \`cocalc.kvGet(key)\` / \`cocalc.kvSet(key, value)\` / \`cocalc.kvGetAll()\`
  App-scoped ephemeral key-value store (per session, in memory).

- \`cocalc.ping()\` → \`{pong, timestamp}\`
  Check bridge connectivity.

- \`cocalc.portURL(port)\` → string
  Get the CoCalc proxy URL for a given port number.

All methods return Promises (except portURL).

## Server Apps (Dash, Shiny, Flask, FastAPI, etc.)

For apps that run a server process, use **server command blocks** to control the App Preview:

\`\`\`server start <port>\`\`\` — switches the preview to server mode, showing the app at that port.
\`\`\`server stop\`\`\` — switches back to static app mode (index.html).
\`\`\`server restart\`\`\` — reloads the server preview iframe (same port).

### Typical workflow:

1. Write the server code to the app directory
2. Start the server via an exec block, binding to a specific port (e.g., 8050)
3. Use a server start block to switch the preview:

\`\`\`server start 8050
\`\`\`

On code changes: kill and restart the server process via exec,
then use \`\`\`server restart\`\`\` to reload the preview.

When the user asks for a static HTML app instead, use \`\`\`server stop\`\`\`
to switch back to index.html mode.

Keep responses concise and focused. Build incrementally — start simple, then enhance.`;

  // Tell the agent how to discover project files on demand
  prompt += `\n\n## Discovering Project Files

To see what files exist next to the .app file, use an exec block:

\`\`\`exec
ls
\`\`\`

This lists files in ${workingDirectory || "the project root"} (the directory containing the .app file).
You can also use cocalc.listFiles() from the app or cocalc.exec("ls", [path])
to list directory contents. When the user asks about data or files, list the
directory first, then read the relevant files with cocalc.readFile().`;

  // Add app errors context
  if (appErrors && appErrors.length > 0) {
    const recentErrors = appErrors.slice(-5);
    prompt += `\n\n## Recent App Errors

The app preview has reported the following JavaScript errors. Fix them:

${recentErrors.map((e) => `- [${e.type}] ${e.message}${e.source ? ` (${e.source}:${e.line})` : ""}`).join("\n")}`;
  }

  return prompt;
}

/**
 * Parse writefile blocks from LLM response.
 */
interface WriteFileBlock {
  path: string;
  content: string;
}

function parseWriteFileBlocks(text: string): WriteFileBlock[] {
  const blocks: WriteFileBlock[] = [];
  const regex = /```writefile\s+(\S+)\n([\s\S]*?)^```[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      path: match[1],
      content: match[2],
    });
  }
  return blocks;
}

/** Map file extension to markdown language hint for syntax highlighting. */
const EXT_TO_LANG: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "javascript",
  ts: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  json: "json",
  py: "python",
  md: "markdown",
  svg: "xml",
};

/**
 * Transform writefile blocks in assistant messages for display.
 * Replaces ```writefile path``` with a file-path label + properly
 * language-tagged fenced code block so StaticMarkdown renders
 * syntax highlighting instead of a plain "writefile" block.
 */
function formatWriteFileBlocks(text: string): string {
  // Transform writefile blocks
  let result = text.replace(
    /```writefile\s+(\S+)\n([\s\S]*?)```/g,
    (_match, filePath: string, content: string) => {
      const ext = filePath.split(".").pop() ?? "";
      const lang = EXT_TO_LANG[ext] ?? ext;
      return `**\u2192 ${filePath}**\n\`\`\`${lang}\n${content}\`\`\``;
    },
  );
  // Transform server command blocks into styled labels
  result = result.replace(
    /```server\s+(start|stop|restart)(?:\s+(\d+))?\s*\n?```/g,
    (_match, verb: string, port?: string) => {
      const label =
        verb === "start"
          ? `\u25B6 Server: start on port ${port ?? "?"}`
          : verb === "stop"
            ? `\u25A0 Server: stop`
            : `\u21BB Server: restart`;
      return `**${label}**`;
    },
  );
  // Transform search/replace blocks into diff display
  result = result.replace(
    /<<<SEARCH\s+(\S+)\n([\s\S]*?)>>>REPLACE\n([\s\S]*?)<<<END/g,
    (_match, filePath: string, search: string, replace: string) => {
      const searchLines = search.replace(/\n$/, "").split("\n");
      const replaceLines = replace.replace(/\n$/, "").split("\n");
      const diffLines = [
        ...searchLines.map((l) => `- ${l}`),
        ...replaceLines.map((l) => `+ ${l}`),
      ];
      return `**\u270E ${filePath}**\n\`\`\`diff\n${diffLines.join("\n")}\n\`\`\``;
    },
  );
  return result;
}

/**
 * Parse exec blocks from LLM response.
 */
interface ExecBlock {
  command: string;
}

function parseExecBlocks(text: string): ExecBlock[] {
  const blocks: ExecBlock[] = [];
  const regex = /```exec\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const cmd = match[1].trim();
    if (cmd) blocks.push({ command: cmd });
  }
  return blocks;
}

/**
 * Parse server command blocks from LLM response.
 *   ```server start 8050
 *   ```
 *   ```server stop
 *   ```
 *   ```server restart
 *   ```
 */
interface ServerBlock {
  verb: ServerVerb;
  port?: number;
}

function parseServerBlocks(text: string): ServerBlock[] {
  const blocks: ServerBlock[] = [];
  const regex = /```server\s+(start|stop|restart)(?:\s+(\d+))?\s*\n?```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const verb = match[1] as ServerVerb;
    const port = match[2] ? parseInt(match[2]) : undefined;
    blocks.push({ verb, port });
  }
  return blocks;
}

/**
 * Parse search/replace blocks with file path:
 *   <<<SEARCH path/to/file
 *   old content
 *   >>>REPLACE
 *   new content
 *   <<<END
 */
interface FileSearchReplace {
  path: string;
  search: string;
  replace: string;
}

function parseFileSearchReplaceBlocks(text: string): FileSearchReplace[] {
  const blocks: FileSearchReplace[] = [];
  const regex = /<<<SEARCH\s+(\S+)\n([\s\S]*?)>>>REPLACE\n([\s\S]*?)<<<END/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      path: match[1],
      search: match[2].replace(/\n$/, ""),
      replace: match[3].replace(/\n$/, ""),
    });
  }
  return blocks;
}


export default function AgentPanel({ name }: EditorComponentProps) {
  const { project_id, path, actions, font_size } = useFrameContext();
  const [model, setModel] = useLanguageModelSetting(project_id);
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
  const llm_markup = useTypedRedux("customize", "llm_markup");
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>("");
  const [costEstimate, setCostEstimate] = useState<CostEstimate>(null);
  const [pendingExec, setPendingExec] = useState<ExecBlock[]>([]);
  const [autoExec, setAutoExec] = useState(false);
  const autoExecRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);
  const streamRef = useRef<{
    removeAllListeners: () => void;
    on: (event: string, handler: (...args: any[]) => void) => void;
  } | null>(null);
  autoExecRef.current = autoExec;
  const generatingRef = useRef(false);
  const sessionIdRef = useRef("");
  const pendingNewSessionRef = useRef("");
  const estimateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedRef = useRef("");
  // Server blocks deferred until exec blocks complete (same LLM turn)
  const pendingServerBlocksRef = useRef<ServerBlock[]>([]);

  const dir = appDir(path);
  // The directory containing the .app file (for exec cwd and system prompt)
  const { head: parentDir } = path_split(path);

  // SyncDB state — piggybacks on the frame editor's syncdb (the .ai file).
  const [syncdb, setSyncdb] = useState<any>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  sessionIdRef.current = sessionId;
  const [allSessions, setAllSessions] = useState<string[]>([]);
  const [sessionNames, setSessionNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [renameModalOpen, setRenameModalOpen] = useState(false);

  // App errors from the store
  const appErrors: AppError[] = (useRedux(name, "app_errors") as any) ?? [];

  // Ref to always call the latest loadSessionsAndMessages from the
  // syncdb change listener (avoids stale closure over old sessionId).
  const loadRef = useRef<((db: any) => void) | null>(null);

  // Get the syncdb from the actions (the .ai file's syncdb)
  useEffect(() => {
    const db = (actions as any)._syncstring;
    if (db == null) return;

    const handleReady = () => {
      setSyncdb(db);
      loadRef.current?.(db);
    };

    const handleChange = () => {
      if (db.get_state() === "ready") {
        loadRef.current?.(db);
      }
    };

    if (db.get_state() === "ready") {
      handleReady();
    } else {
      db.once("ready", handleReady);
    }
    db.on("change", handleChange);

    return () => {
      db.removeListener("change", handleChange);
    };
  }, [actions]);

  const loadSessionsAndMessages = useCallback(
    (db: any) => {
      if (db?.get_state() !== "ready") return;

      const allRecords = db.get();
      if (allRecords == null) return;

      const sessionsSet = new Set<string>();
      const msgsBySession = new Map<string, DisplayMessage[]>();
      const names = new Map<string, string>();

      allRecords.forEach((record: any) => {
        const sid = record.get("session_id");
        if (!sid) return;
        sessionsSet.add(sid);

        // Skip session_name records from messages — they use a
        // sentinel date ("session_name:<sid>") that would corrupt sorting.
        if (record.get("event") === "session_name") {
          const name = record.get("content");
          if (name) names.set(sid, name);
          return;
        }

        if (!msgsBySession.has(sid)) {
          msgsBySession.set(sid, []);
        }

        msgsBySession.get(sid)!.push({
          sender: record.get("sender") ?? "user",
          content: record.get("content") ?? "",
          date: record.get("date") ?? "",
          event: record.get("event") ?? "message",
          account_id: record.get("account_id"),
        });
      });
      setSessionNames(names);

      // Sort sessions by most recent message date (newest last)
      const sessions = Array.from(sessionsSet).sort((a, b) => {
        const msgsA = msgsBySession.get(a) ?? [];
        const msgsB = msgsBySession.get(b) ?? [];
        const latestA = msgsA.reduce(
          (max, m) => Math.max(max, new Date(m.date).valueOf() || 0),
          0,
        );
        const latestB = msgsB.reduce(
          (max, m) => Math.max(max, new Date(m.date).valueOf() || 0),
          0,
        );
        return latestA - latestB;
      });
      setAllSessions(sessions);

      // Keep the current sessionId if it is set — this covers both sessions
      // that already exist in the data AND brand-new sessions that have no
      // messages persisted yet (created via "New").  Only fall back to the
      // most recent session when sessionId is empty/unset.
      const activeSession = sessionId
        ? sessionId
        : sessions.length > 0
          ? sessions[sessions.length - 1]
          : "";

      if (activeSession !== sessionId) {
        setSessionId(activeSession);
      }

      const msgs = msgsBySession.get(activeSession) ?? [];
      msgs.sort(
        (a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf(),
      );
      setMessages(msgs);
    },
    [sessionId],
  );
  loadRef.current = loadSessionsAndMessages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (syncdb?.get_state() === "ready") {
      loadSessionsAndMessages(syncdb);
    }
  }, [sessionId, syncdb]);

  const handleNewSession = useCallback(() => {
    const newId = uuid();
    setSessionId(newId);
    setMessages([]);
    setPendingExec([]);
    setError("");
  }, []);

  const handleClearSession = useCallback(() => {
    if (!syncdb || !sessionId) return;
    const allRecords = syncdb.get();
    if (allRecords != null) {
      allRecords.forEach((record: any) => {
        if (record.get("session_id") === sessionId) {
          syncdb.delete({
            session_id: sessionId,
            date: record.get("date"),
          });
        }
      });
      syncdb.commit();
    }
    setMessages([]);
    setPendingExec([]);
  }, [syncdb, sessionId]);

  const writeMessage = useCallback(
    (msg: {
      date: string;
      sender: "user" | "assistant" | "system";
      content: string;
      account_id?: string;
      event: string;
      session_id?: string;
    }) => {
      if (!syncdb || syncdb.get_state() !== "ready") return;
      const sid = msg.session_id || sessionId || uuid();

      syncdb.set({
        session_id: sid,
        date: msg.date,
        sender: msg.sender,
        content: msg.content,
        account_id: msg.account_id,
        event: msg.event,
      });
      syncdb.commit();
    },
    [syncdb, sessionId],
  );

  const writeSessionName = useCallback(
    (name: string, sid?: string) => {
      if (!syncdb || syncdb.get_state() !== "ready") return;
      const targetSid = sid || sessionIdRef.current;
      if (!targetSid) return;

      const date = `session_name:${targetSid}`;
      syncdb.set({
        session_id: targetSid,
        date,
        sender: "system",
        content: name,
        event: "session_name",
      });
      syncdb.commit();
      setSessionNames((prev) => new Map(prev).set(targetSid, name));
    },
    [syncdb],
  );

  const applyWriteFiles = useCallback(
    async (blocks: WriteFileBlock[]) => {
      // Auto-write the bridge SDK to the app directory so apps can use it
      const bridgePath = join(dir, "cocalc-app-bridge.js");
      try {
        await webapp_client.project_client.writeFile({
          project_id,
          path: bridgePath,
          content: getBridgeSDKSource(),
        });
      } catch {
        // non-fatal — the bridge is optional
      }

      // Clear app errors before applying new files
      (actions as any).clearAppErrors?.();

      for (const block of blocks) {
        // block.path comes from the LLM and already includes the app
        // directory prefix (the system prompt tells it to use
        // `${appDirectory}/filename`).  Normalize to resolve any ".."
        // segments, then reject paths that escape the app directory.
        const resolvedPath = join(block.path);
        if (!resolvedPath.startsWith(dir + "/") && resolvedPath !== dir) {
          const now = new Date().toISOString();
          writeMessage({
            date: now,
            sender: "system",
            content: `Blocked write to \`${block.path}\`: path escapes app directory.`,
            event: "exec_result",
          });
          continue;
        }
        try {
          await webapp_client.project_client.writeFile({
            project_id,
            path: resolvedPath,
            content: block.content,
          });
        } catch (err: any) {
          const now = new Date().toISOString();
          writeMessage({
            date: now,
            sender: "system",
            content: `Error writing \`${resolvedPath}\`: ${err.message ?? err}`,
            event: "exec_result",
          });
        }
      }
      // Trigger app preview reload
      (actions as any).reloadAppPreview?.();

      const now = new Date().toISOString();
      const fileList = blocks.map((b) => `\`${b.path}\``).join(", ");
      writeMessage({
        date: now,
        sender: "system",
        content: `Wrote ${blocks.length} file(s): ${fileList}`,
        event: "exec_result",
      });
    },
    [project_id, actions, writeMessage],
  );

  const applySearchReplaceFiles = useCallback(
    async (blocks: FileSearchReplace[]) => {
      // Ensure the bridge SDK exists (same as applyWriteFiles)
      const bridgePath = join(dir, "cocalc-app-bridge.js");
      try {
        await webapp_client.project_client.writeFile({
          project_id,
          path: bridgePath,
          content: getBridgeSDKSource(),
        });
      } catch {
        // non-fatal — the bridge is optional
      }

      // Group blocks by file path
      const byFile = new Map<string, FileSearchReplace[]>();
      for (const block of blocks) {
        const resolvedPath = join(block.path);
        if (!resolvedPath.startsWith(dir + "/") && resolvedPath !== dir) {
          const now = new Date().toISOString();
          writeMessage({
            date: now,
            sender: "system",
            content: `Blocked patch to \`${block.path}\`: path escapes app directory.`,
            event: "exec_result",
          });
          continue;
        }
        if (!byFile.has(resolvedPath)) byFile.set(resolvedPath, []);
        byFile.get(resolvedPath)!.push(block);
      }

      let totalApplied = 0;
      let totalFailed = 0;
      const patchedFiles: string[] = [];

      for (const [filePath, fileBlocks] of byFile) {
        try {
          const buf = await webapp_client.project_client.readFile({
            project_id,
            path: filePath,
          });
          const content = buf.toString();
          const srBlocks = fileBlocks.map((b) => ({
            search: b.search,
            replace: b.replace,
          }));
          const { result, applied, failed } = applySearchReplace(
            content,
            srBlocks,
          );
          totalApplied += applied;
          totalFailed += failed;
          if (applied > 0) {
            await webapp_client.project_client.writeFile({
              project_id,
              path: filePath,
              content: result,
            });
            patchedFiles.push(filePath);
          }
        } catch (err: any) {
          totalFailed += fileBlocks.length;
          const now = new Date().toISOString();
          writeMessage({
            date: now,
            sender: "system",
            content: `Error patching \`${filePath}\`: ${err.message ?? err}`,
            event: "exec_result",
          });
        }
      }

      if (patchedFiles.length > 0) {
        (actions as any).reloadAppPreview?.();
        const now = new Date().toISOString();
        writeMessage({
          date: now,
          sender: "system",
          content: `Patched ${patchedFiles.length} file(s) (${totalApplied} applied, ${totalFailed} failed): ${patchedFiles.map((f) => `\`${f}\``).join(", ")}`,
          event: "exec_result",
        });
      } else if (totalFailed > 0) {
        const now = new Date().toISOString();
        writeMessage({
          date: now,
          sender: "system",
          content: `Search/replace failed: ${totalFailed} block(s) did not match.`,
          event: "exec_result",
        });
      }
    },
    [project_id, dir, actions, writeMessage],
  );

  // Apply a list of server command blocks to the actions store
  const applyServerBlocks = useCallback(
    (blocks: ServerBlock[]) => {
      const a = actions as any;
      for (const sb of blocks) {
        switch (sb.verb) {
          case "start":
            if (sb.port) a.setServerMode(sb.port);
            break;
          case "stop":
            a.stopServer();
            break;
          case "restart":
            a.restartServer();
            break;
        }
      }
    },
    [actions],
  );

  const handleExecCommand = useCallback(
    async (command: string) => {
      try {
        const result = await exec(
          {
            project_id,
            command: "/bin/bash",
            args: ["-c", command],
            timeout: 60,
            max_output: 100000,
            bash: false,
            path: parentDir,
            err_on_exit: false,
          },
          path,
        );

        const output = [
          result.stdout ? `**stdout:**\n\`\`\`\n${result.stdout}\n\`\`\`` : "",
          result.stderr ? `**stderr:**\n\`\`\`\n${result.stderr}\n\`\`\`` : "",
          result.exit_code != null ? `Exit code: ${result.exit_code}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const now = new Date().toISOString();
        writeMessage({
          date: now,
          sender: "system",
          content: `Executed: \`${command}\`\n\n${output}`,
          event: "exec_result",
        });
      } catch (err: any) {
        const now = new Date().toISOString();
        writeMessage({
          date: now,
          sender: "system",
          content: `Error executing \`${command}\`: ${err.message ?? err}`,
          event: "exec_result",
        });
      }
      setPendingExec((prev) => {
        const remaining = prev.filter((e) => e.command !== command);
        // When the last exec block finishes, flush any deferred server blocks
        if (remaining.length === 0 && pendingServerBlocksRef.current.length > 0) {
          const deferred = pendingServerBlocksRef.current;
          pendingServerBlocksRef.current = [];
          applyServerBlocks(deferred);
        }
        return remaining;
      });
    },
    [project_id, path, parentDir, writeMessage, applyServerBlocks],
  );

  const handleSubmit = useCallback(
    async (submittedValue?: string) => {
      const prompt = (submittedValue ?? input).trim();
      if (!prompt || generatingRef.current) return;

      lastSubmittedRef.current = prompt;
      setError("");
      setPendingExec([]);

      // Detach any still-running stream from a previous submission
      const prevStream = streamRef.current;
      if (prevStream) {
        prevStream.removeAllListeners();
        prevStream.on("error", () => {});
        streamRef.current = null;
      }
      cancelRef.current = false;

      let activeSessionId = sessionId;
      if (!activeSessionId) {
        activeSessionId = uuid();
        setSessionId(activeSessionId);
      }

      const now = new Date().toISOString();
      const accountId =
        redux.getStore("account")?.get_account_id?.() ?? "unknown";

      writeMessage({
        date: now,
        sender: "user",
        content: prompt,
        account_id: accountId,
        event: "message",
        session_id: activeSessionId,
      });

      setInput("");
      generatingRef.current = true;
      setGenerating(true);

      try {
        const system = buildSystemPrompt(dir, parentDir, appErrors);

        // Include all messages in history so the LLM can see exec results
        const history = messages.map((m) => ({
          role:
            m.sender === "assistant"
              ? ("assistant" as const)
              : ("user" as const),
          content:
            m.event === "exec_result" ? `[System: ${m.content}]` : m.content,
        }));

        const llmStream = webapp_client.openai_client.queryStream({
          input: prompt,
          system,
          history,
          model,
          project_id,
          tag: TAG,
        });
        streamRef.current = llmStream;

        let assistantContent = "";
        const streamingMsgs = [
          ...messages,
          {
            sender: "user" as const,
            content: prompt,
            date: now,
            event: "message",
            account_id: accountId,
          },
        ];

        llmStream.on("token", (token: string | null) => {
          if (cancelRef.current) {
            // Fully detach so no more tokens are processed
            llmStream.removeAllListeners();
            llmStream.on("error", () => {});
            streamRef.current = null;
            return;
          }
          if (token != null) {
            assistantContent += token;
            // Skip UI updates if user switched sessions mid-stream
            if (sessionIdRef.current !== activeSessionId) return;
            setMessages([
              ...streamingMsgs,
              {
                sender: "assistant",
                content: assistantContent,
                date: "",
                event: "message",
              },
            ]);
          } else {
            generatingRef.current = false;
            setGenerating(false);
            streamRef.current = null;

            const assistantDate = new Date().toISOString();
            writeMessage({
              date: assistantDate,
              sender: "assistant",
              content: assistantContent,
              event: "message",
              session_id: activeSessionId,
            });

            // Apply all tool blocks from the response. Writefile and
            // search/replace are awaited in sequence so patches see
            // files written in the same turn.
            const writeBlocks = parseWriteFileBlocks(assistantContent);
            const srBlocks = parseFileSearchReplaceBlocks(assistantContent);
            const execBlocks = parseExecBlocks(assistantContent);
            const serverBlocks = parseServerBlocks(assistantContent);

            (async () => {
              // 1. Write files first
              if (writeBlocks.length > 0) {
                await applyWriteFiles(writeBlocks);
              }
              // 2. Then apply patches (may target just-written files)
              if (srBlocks.length > 0) {
                await applySearchReplaceFiles(srBlocks);
              }
              // 3. Exec blocks — auto-run or queue for confirmation
              if (execBlocks.length > 0) {
                if (autoExecRef.current) {
                  for (const cmd of execBlocks) {
                    handleExecCommand(cmd.command);
                  }
                } else {
                  setPendingExec(execBlocks);
                }
              }
              // 4. Server command blocks — if exec blocks are also
              // present, defer until they complete so the server process
              // is actually running before the iframe connects.
              if (serverBlocks.length > 0) {
                if (execBlocks.length > 0) {
                  pendingServerBlocksRef.current = serverBlocks;
                } else {
                  applyServerBlocks(serverBlocks);
                }
              }
            })();
          }
        });

        llmStream.on("error", (err: Error) => {
          setError(err.message ?? `${err}`);
          generatingRef.current = false;
          setGenerating(false);
          streamRef.current = null;
        });
      } catch (err: any) {
        setError(err.message ?? `${err}`);
        generatingRef.current = false;
        setGenerating(false);
      }
    },
    [
      input,
      messages,
      dir,
      model,
      project_id,
      sessionId,
      writeMessage,
      applyWriteFiles,
      applySearchReplaceFiles,
      handleExecCommand,
      applyServerBlocks,
      appErrors,
    ],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      if (!value.trim()) {
        if (estimateTimeoutRef.current) {
          clearTimeout(estimateTimeoutRef.current);
        }
        setCostEstimate(null);
        return;
      }
      if (estimateTimeoutRef.current) {
        clearTimeout(estimateTimeoutRef.current);
      }
      estimateTimeoutRef.current = setTimeout(async () => {
        if (!model) {
          setCostEstimate(null);
          return;
        }
        if (isFreeModel(model, isCoCalcCom)) {
          setCostEstimate({ min: 0, max: 0 });
          return;
        }
        try {
          const { numTokensEstimate } =
            await import("@cocalc/frontend/misc/llm");
          const currentMessages = messages.filter((m) => m.event === "message");
          const historyText = currentMessages.map((m) => m.content).join("\n");
          const tokens = numTokensEstimate([historyText, value].join("\n"));
          const est = calcMinMaxEstimation(tokens, model, llm_markup);
          setCostEstimate(est);
        } catch {
          setCostEstimate(null);
        }
      }, 500);
    },
    [model, isCoCalcCom, llm_markup, messages],
  );

  // Build a session-like object for AgentInputArea and AgentSessionBar
  const session: AgentSession = useMemo(
    () => ({
      syncdb,
      messages,
      sessionId,
      allSessions,
      sessionNames,
      generating,
      error,
      setGenerating,
      setError,
      setMessages,
      writeMessage: writeMessage as any,
      handleNewSession,
      handleClearSession,
      writeSessionName,
      setSessionId,
      messagesEndRef,
      cancelRef,
      generatingRef,
      sessionIdRef,
      pendingNewSessionRef,
    }),
    [
      syncdb,
      messages,
      sessionId,
      allSessions,
      sessionNames,
      generating,
      error,
      handleNewSession,
      handleClearSession,
      writeMessage,
      writeSessionName,
    ],
  );

  const autoNameSession = useAutoNameSession({
    session,
    model,
    project_id,
    tag: TAG,
  });

  return (
    <div style={CONTAINER_STYLE}>
      {/* Header */}
      <div
        style={{
          flex: "0 0 auto",
          padding: "6px 12px",
          borderBottom: `1px solid ${COLORS.GRAY_L}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <AIAvatar size={20} />
        <span style={{ fontWeight: 500 }}>App Agent</span>
        <div style={{ flex: 1 }} />
        <LLMSelector
          model={model}
          setModel={setModel}
          project_id={project_id}
          size="small"
        />
      </div>

      {/* Session bar */}
      <AgentSessionBar
        session={session}
        onAutoName={autoNameSession}
        onRename={() => setRenameModalOpen(true)}
      />

      {/* Rename modal */}
      <RenameModal
        open={renameModalOpen}
        currentName={sessionNames.get(sessionId) ?? ""}
        onSave={(name) => {
          writeSessionName(name);
          setRenameModalOpen(false);
        }}
        onCancel={() => setRenameModalOpen(false)}
      />

      {/* App error banner */}
      {appErrors.length > 0 && (
        <div
          style={{
            flex: "0 0 auto",
            padding: "4px 12px",
            background: COLORS.ANTD_BG_RED_L,
            borderBottom: `1px solid ${COLORS.ANTD_BG_RED_M}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: "0.85em",
          }}
        >
          <Icon name="warning" style={{ color: COLORS.ANTD_RED_WARN }} />
          <span style={{ flex: 1 }}>
            {appErrors.length} app error(s) — included in next prompt for
            auto-fix
          </span>
          <Button
            size="small"
            onClick={() => (actions as any).clearAppErrors?.()}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Messages — disable the code toolbar and render writefile blocks
           with proper language syntax highlighting */}
      <FileContext.Provider value={{ disableMarkdownCodebar: true }}>
        <div
          style={{
            ...MESSAGES_STYLE,
            fontSize: `${font_size}px`,
          }}
        >
          {messages.length === 0 && (
            <Paragraph
              style={{
                color: COLORS.GRAY_M,
                textAlign: "center",
                marginTop: 20,
              }}
            >
              Describe the application you want to build. The agent will create
              files and the result will appear in the App preview on the right.
            </Paragraph>
          )}
          {messages.map((msg, i) => (
            <div
              key={`${msg.date}-${i}`}
              style={
                msg.sender === "user"
                  ? USER_MSG_STYLE
                  : msg.sender === "system"
                    ? msg.content.includes("Error")
                      ? ERROR_MSG_STYLE
                      : SYSTEM_MSG_STYLE
                    : ASSISTANT_MSG_STYLE
              }
            >
              {msg.sender === "user" ? (
                msg.content
              ) : (
                <div className="cc-agent-writefile-blocks">
                  <StaticMarkdown
                    value={formatWriteFileBlocks(msg.content)}
                  />
                </div>
              )}
            </div>
          ))}
          {generating && (
            <div style={{ textAlign: "center", padding: 8 }}>
              <Spin size="small" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </FileContext.Provider>

      {/* Pending exec commands */}
      {pendingExec.length > 0 && (
        <div
          style={{
            flex: "0 0 auto",
            padding: "6px 12px",
            borderTop: `1px solid ${COLORS.GRAY_L}`,
            background: COLORS.YELL_LLL,
          }}
        >
          <div
            style={{
              marginBottom: 4,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="terminal" /> Commands to execute:
            <div style={{ flex: 1 }} />
            <Button
              size="small"
              type="primary"
              onClick={() => {
                for (const cmd of pendingExec) {
                  handleExecCommand(cmd.command);
                }
              }}
            >
              <Icon name="play" /> Run All
            </Button>
            <Tooltip title="When enabled, exec commands run automatically without asking">
              <Button
                size="small"
                type={autoExec ? "primary" : "default"}
                onClick={() => {
                  const next = !autoExec;
                  setAutoExec(next);
                  if (next) {
                    // Run all currently pending commands immediately
                    for (const cmd of pendingExec) {
                      handleExecCommand(cmd.command);
                    }
                  }
                }}
              >
                <Icon name="bolt" /> Auto
              </Button>
            </Tooltip>
          </div>
          {pendingExec.map((cmd, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <code
                style={{
                  flex: 1,
                  fontSize: "0.85em",
                  background: COLORS.GRAY_LLL,
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                {cmd.command}
              </code>
              <Button
                size="small"
                type="primary"
                onClick={() => handleExecCommand(cmd.command)}
              >
                <Icon name="play" /> Run
              </Button>
              <Button
                size="small"
                onClick={() =>
                  setPendingExec((prev) =>
                    prev.filter((e) => e.command !== cmd.command),
                  )
                }
              >
                Dismiss
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Error display */}
      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError("")}
          style={{ flex: "0 0 auto", margin: "4px 12px" }}
        />
      )}

      {/* Input area */}
      <AgentInputArea
        session={session}
        onSubmit={() => handleSubmit()}
        onCancel={() => {
          setInput(lastSubmittedRef.current);
        }}
        sendDisabled={!input.trim()}
        showDone
        doneHighlight={false}
        aboveButtons={
          costEstimate ? (
            <LLMCostEstimationChat
              costEstimate={costEstimate}
              compact
              style={{
                flex: 0,
                fontSize: "85%",
                textAlign: "center",
                margin: "0 0 4px 0",
              }}
            />
          ) : undefined
        }
      >
        <MarkdownInput
          value={input}
          onChange={handleInputChange}
          onShiftEnter={(value) => {
            handleSubmit(value);
          }}
          placeholder="Describe the app you want..."
          height="auto"
          editBarStyle={{ overflow: "auto" }}
          style={{ minHeight: "72px", maxHeight: "200px", overflow: "auto" }}
        />
      </AgentInputArea>
    </div>
  );
}
