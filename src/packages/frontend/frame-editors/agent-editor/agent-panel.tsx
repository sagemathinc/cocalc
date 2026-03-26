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

import { Alert, Button } from "antd";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { redux, useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";
import type { CSS } from "@cocalc/frontend/app-framework";
import { LLMCostEstimationChat } from "@cocalc/frontend/chat/llm-cost-estimation";
import { backtickSequence } from "@cocalc/frontend/markdown/util";
import { Icon } from "@cocalc/frontend/components";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { AgentHeader } from "@cocalc/frontend/frame-editors/llm/agent-base/agent-header";
import { AgentInputArea } from "@cocalc/frontend/frame-editors/llm/agent-base/agent-input-area";
import { AgentMessages } from "@cocalc/frontend/frame-editors/llm/agent-base/agent-messages";
import { AgentSessionBar } from "@cocalc/frontend/frame-editors/llm/agent-base/agent-session-bar";
import { PendingExecBar } from "@cocalc/frontend/frame-editors/llm/agent-base/pending-exec-bar";
import { RenameModal } from "@cocalc/frontend/frame-editors/llm/agent-base/rename-modal";
import {
  ASSISTANT_MSG_STYLE,
  ERROR_MSG_STYLE,
  SYSTEM_MSG_STYLE,
  USER_MSG_STYLE,
} from "@cocalc/frontend/frame-editors/llm/agent-base/types";
import type { DisplayMessage } from "@cocalc/frontend/frame-editors/llm/agent-base/types";
import { useAutoNameSession } from "@cocalc/frontend/frame-editors/llm/agent-base/use-auto-name-session";
import { useAgentSession } from "@cocalc/frontend/frame-editors/llm/agent-base/use-agent-session";
import { useCostEstimate } from "@cocalc/frontend/frame-editors/llm/agent-base/use-cost-estimate";
import { runStreamingTurn } from "@cocalc/frontend/frame-editors/llm/agent-base/run-streaming-turn";
import type { StreamHandle } from "@cocalc/frontend/frame-editors/llm/agent-base/run-streaming-turn";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { path_split, uuid } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import type { EditorComponentProps } from "../frame-tree/types";
import { appDir } from "./app-preview";
import { getBridgeSDKSource } from "./cocalc-app-bridge";
import type { AppError } from "./actions";
import type { ServerVerb } from "./actions";
import {
  applySearchReplace,
  formatExecResult,
  formatFileSearchReplaceAsDiff,
  parseExecBlocks,
  parseFileSearchReplaceBlocks,
} from "../llm/coding-agent-utils";
import type { FileSearchReplace } from "../llm/coding-agent-utils";
import type { ExecBlock } from "../llm/coding-agent-types";

const TAG = "ai-agent";

const CONTAINER_STYLE: CSS = {
  display: "flex",
  flexDirection: "column",
  flex: "1 1 0",
  minHeight: 0,
  overflow: "hidden",
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

## Choosing App Mode

**Use static mode** (the default) when everything can run in the browser —
pure HTML/CSS/JS apps, or apps that use \`cocalc.exec()\` / \`cocalc.python()\`
for computation. No server process needed.

**Use server mode** when the app requires a persistent HTTP server —
frameworks like Flask, FastAPI, Dash, Shiny, Streamlit, Gradio, or any
app that needs WebSockets or server-side state. In server mode the preview
connects to a port in the project container via CoCalc's proxy.

## Server Apps (Dash, Shiny, Flask, FastAPI, etc.)

**IMPORTANT**: The app preview loads through a reverse proxy. All fetch/AJAX
calls in the server app MUST use **relative URLs** (e.g., \`fetch("update")\`
not \`fetch("/update")\`). Absolute paths bypass the proxy and will fail.

Use **server command blocks** to control the App Preview:

\`\`\`server start <port>\`\`\` — switches the preview to server mode, showing the app at that port.
\`\`\`server stop\`\`\` — switches back to static app mode (index.html).
\`\`\`server restart\`\`\` — reloads the server preview iframe (same port).

### Typical workflow:

1. **Install dependencies first** via exec (e.g., \`pip install flask\` or \`uv add flask\`)
2. Write the server code to the app directory
3. Start the server via an exec block, binding to \`0.0.0.0\` on a specific port (e.g., 8050)
4. Use a server start block to switch the preview:

\`\`\`server start 8050
\`\`\`

### Killing and restarting a server

The server command blocks only control the preview iframe — they do NOT
start or stop OS processes. You must manage the server process yourself.

To kill a running server before restarting:
- \`fuser -k 8050/tcp\` — kill whatever is listening on port 8050
- \`pkill -f app.py\` — kill by script name

Always kill the old process before starting a new one to avoid
"Address already in use" errors. A typical code-change cycle:

\`\`\`exec
fuser -k 8050/tcp 2>/dev/null; cd \${dir} && python app.py &
\`\`\`

\`\`\`server restart
\`\`\`

### Server logging and debugging

Always redirect server output to a log file so you can diagnose startup errors:

\`\`\`exec
cd \${dir} && python app.py > app.log 2>&1 &
\`\`\`

Then check for errors:

\`\`\`exec
tail -50 \${dir}/app.log
\`\`\`

If the server fails to start, read the log before retrying.

When the user asks for a static HTML app instead, use \`\`\`server stop\`\`\`
to switch back to index.html mode.

Keep responses concise and focused. Build incrementally — start simple, then enhance.`;

  // Tell the agent how to discover project files and set up environments
  prompt += `\n\n## Project Files and Environment Setup

Exec blocks run in ${workingDirectory || "the project root"} (the directory containing the .app file).
The app directory is \`${appDirectory}\`.

Use exec blocks freely for file management and environment setup:
- \`ls ${appDirectory}\` — list app files
- \`ls\` — list files in the working directory
- \`cat ${appDirectory}/filename\` — read a file
- \`git init\`, \`git add\`, etc. — version control
- \`uv init && uv add flask\` — set up a Python environment with uv
- \`pip install package\` — install Python packages
- \`npm install package\` — install Node packages

When the user asks about data or files, list the directory first, then
read the relevant files.`;

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
  // Use backreference so that inner ``` fences (e.g. in markdown files)
  // don't terminate the block early.  The LLM can use 4+ backticks to
  // wrap content that itself contains triple backticks.
  const regex = /^(`{3,})writefile\s+(.+)\n([\s\S]*?)^\1[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      path: match[2],
      content: match[3],
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
  // Transform writefile blocks (backreference ensures nested fences don't close early)
  let result = text.replace(
    /^(`{3,})writefile\s+(.+)\n([\s\S]*?)^\1[ \t]*$/gm,
    (_match, _fence: string, filePath: string, content: string) => {
      const ext = filePath.split(".").pop() ?? "";
      const lang = EXT_TO_LANG[ext] ?? ext;
      // Use a safe fence so nested backticks in the content don't
      // close the display block early (e.g. markdown with code fences).
      const closeFence = backtickSequence(content);
      const openFence = lang ? `${closeFence}${lang}` : closeFence;
      return `**\u2192 ${filePath}**\n${openFence}\n${content}${closeFence}`;
    },
  );
  // Transform server command blocks into styled labels (anchored to line start)
  result = result.replace(
    /^```server\s+(start|stop|restart)(?:\s+(\d+))?\s*\n?```/gm,
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
  result = formatFileSearchReplaceAsDiff(result);
  return result;
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
  // Anchored to line start (^) so inline mentions like "use ```server stop```"
  // in explanatory text don't accidentally trigger a mode switch.
  const regex = /^```server\s+(start|stop|restart)(?:\s+(\d+))?\s*\n?```/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const verb = match[1] as ServerVerb;
    const port = match[2] ? parseInt(match[2]) : undefined;
    blocks.push({ verb, port });
  }
  return blocks;
}

/**
 * Custom message style for the app agent.  The app agent detects errors
 * by checking the message content (unlike the coding agent which uses
 * msg.event === "error"), so we preserve that content-based heuristic.
 */
function appMessageStyle(msg: DisplayMessage): CSS {
  if (msg.sender === "user") return USER_MSG_STYLE;
  if (msg.sender === "system") {
    if (msg.content.includes("Error")) return ERROR_MSG_STYLE;
    return SYSTEM_MSG_STYLE;
  }
  return ASSISTANT_MSG_STYLE;
}

/**
 * Render the content of a single message.  User messages are shown as
 * plain text; assistant and system messages go through StaticMarkdown
 * with writefile-block formatting.
 */
function renderAppMessage(msg: DisplayMessage): ReactNode {
  if (msg.sender === "user") {
    return msg.content;
  }
  return (
    <div className="cc-agent-writefile-blocks">
      <StaticMarkdown value={formatWriteFileBlocks(msg.content)} />
    </div>
  );
}

export default function AgentPanel({ name }: EditorComponentProps) {
  const { project_id, path, actions, font_size } = useFrameContext();
  const [model, setModel] = useLanguageModelSetting(project_id);
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
  const llm_markup = useTypedRedux("customize", "llm_markup");
  const [input, setInput] = useState("");
  const [pendingExec, setPendingExec] = useState<ExecBlock[]>([]);
  const [autoExec, setAutoExec] = useState(false);
  const autoExecRef = useRef(false);
  const streamRef = useRef<StreamHandle | null>(null);
  autoExecRef.current = autoExec;
  const lastSubmittedRef = useRef("");
  // Server blocks deferred until exec blocks complete (same LLM turn)
  const pendingServerBlocksRef = useRef<ServerBlock[]>([]);
  // Track in-flight exec block IDs to prevent double-dispatch
  const executingExecIdsRef = useRef<Set<number>>(new Set());

  const dir = appDir(path);
  // The directory containing the .app file (for exec cwd and system prompt)
  const { head: parentDir } = path_split(path);

  // Session management via the shared hook — piggybacks on the frame
  // editor's own syncdb (the .ai file).
  const session = useAgentSession({
    existingSyncdb: (actions as any)?._syncstring,
    eventName: TAG,
    project_id,
    skipEvents: ["server_state"],
    sessionSort: "latest",
    validateSessionExists: false,
  });
  const {
    messages,
    sessionId,
    sessionNames,
    error,
    setGenerating,
    setError,
    setMessages,
    writeMessage,
    writeSessionName,
    setSessionId,
    cancelRef,
    generatingRef,
    sessionIdRef,
  } = session;

  // ---- Cost estimation ----
  const { costEstimate, updateEstimate, clearEstimate } = useCostEstimate({
    model,
    isCoCalcCom,
    llm_markup,
    messages,
  });

  // Cleanup streams and cost-estimate timer on unmount
  useEffect(() => {
    return () => {
      clearEstimate();
      if (streamRef.current) {
        streamRef.current.removeAllListeners();
        streamRef.current = null;
      }
    };
  }, []);

  // Wrap hook's handleNewSession/handleClearSession to also clear
  // AgentPanel-specific state (pending exec blocks).
  const handleNewSession = useCallback(() => {
    session.handleNewSession();
    setPendingExec([]);
  }, [session.handleNewSession]);

  const handleClearSession = useCallback(() => {
    session.handleClearSession();
    setPendingExec([]);
  }, [session.handleClearSession]);

  const [renameModalOpen, setRenameModalOpen] = useState(false);

  // App errors from the store
  const appErrors: AppError[] = (useRedux(name, "app_errors") as any) ?? [];

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
            msg_event: "exec_result",
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
            msg_event: "exec_result",
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
        msg_event: "exec_result",
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
            msg_event: "exec_result",
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
            msg_event: "exec_result",
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
          msg_event: "exec_result",
        });
      } else if (totalFailed > 0) {
        const now = new Date().toISOString();
        writeMessage({
          date: now,
          sender: "system",
          content: `Search/replace failed: ${totalFailed} block(s) did not match.`,
          msg_event: "exec_result",
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
            if (sb.port) {
              a.setServerMode(sb.port);
            } else {
              writeMessage({
                date: new Date().toISOString(),
                sender: "system",
                content:
                  "server start block missing port number — no action taken. Use: ```server start <port>```",
                msg_event: "exec_result",
              });
            }
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
    [actions, writeMessage],
  );

  const handleExecCommand = useCallback(
    async (blockId: number, command: string) => {
      // Prevent double-dispatch: skip if this block is already executing
      if (executingExecIdsRef.current.has(blockId)) return;
      executingExecIdsRef.current.add(blockId);
      // Capture the session ID before the async gap so the result lands
      // in the originating session even if the user switches sessions.
      const execSessionId = sessionIdRef.current;
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

        writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: formatExecResult(result, command),
          msg_event: "exec_result",
          session_id: execSessionId,
        });
      } catch (err: any) {
        writeMessage({
          date: new Date().toISOString(),
          sender: "system",
          content: `Error running \`${command}\`: ${err.message ?? err}`,
          msg_event: "exec_result",
        });
      }
      executingExecIdsRef.current.delete(blockId);
      setPendingExec((prev) => {
        const remaining = prev.filter((e) => e.id !== blockId);
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
      // Only clear pending exec/server state if no exec is still in flight
      // from the previous turn.  Otherwise deferred server blocks would be
      // dropped and never applied.
      setPendingExec((prev) => {
        if (prev.length === 0) {
          pendingServerBlocksRef.current = [];
        }
        return [];
      });

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
        msg_event: "message",
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

        const stream = runStreamingTurn({
          input: prompt,
          system,
          history,
          model,
          project_id,
          tag: TAG,
          cancelRef,
          sessionIdRef,
          activeSessionId,
          onToken(accumulated, _token) {
            setMessages([
              ...streamingMsgs,
              {
                sender: "assistant",
                content: accumulated,
                date: "",
                event: "message",
              },
            ]);
          },
          onComplete(assistantContent) {
            generatingRef.current = false;
            setGenerating(false);
            streamRef.current = null;

            const assistantDate = new Date().toISOString();
            writeMessage({
              date: assistantDate,
              sender: "assistant",
              content: assistantContent,
              msg_event: "message",
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
              // 3. Exec blocks — auto-run or queue for confirmation.
              // Always seed pendingExec so the dequeue logic in
              // handleExecCommand can track completion and flush
              // deferred server blocks at the right time.
              if (execBlocks.length > 0) {
                setPendingExec(execBlocks);
                if (autoExecRef.current) {
                  for (const cmd of execBlocks) {
                    handleExecCommand(cmd.id, cmd.command);
                  }
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
          },
          onError(err) {
            setError(err.message ?? `${err}`);
            generatingRef.current = false;
            setGenerating(false);
            streamRef.current = null;
          },
        });
        streamRef.current = stream;
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
      updateEstimate(value);
    },
    [updateEstimate],
  );

  // Wrap the hook's session with our local handleNewSession/handleClearSession
  // that also clear pending exec blocks.
  const wrappedSession = { ...session, handleNewSession, handleClearSession };

  const autoNameSession = useAutoNameSession({
    session,
    model,
    project_id,
    tag: TAG,
  });

  return (
    <div style={CONTAINER_STYLE}>
      {/* Header */}
      <AgentHeader
        title="App Agent"
        model={model}
        setModel={setModel}
        project_id={project_id}
      />

      {/* Session bar */}
      <AgentSessionBar
        session={wrappedSession}
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
        <AgentMessages
          session={session}
          renderMessage={renderAppMessage}
          messageStyle={appMessageStyle}
          fontSize={font_size}
          emptyText="Describe the application you want to build. The agent will create files and the result will appear in the App preview on the right."
        />
      </FileContext.Provider>

      {/* Pending exec commands */}
      <PendingExecBar
        pendingExec={pendingExec}
        onRun={handleExecCommand}
        onDismiss={(blockId) =>
          setPendingExec((prev) => prev.filter((e) => e.id !== blockId))
        }
        onDismissAll={() => setPendingExec([])}
        onRunAll={() => {
          for (const cmd of pendingExec) {
            handleExecCommand(cmd.id, cmd.command);
          }
        }}
        autoExec={autoExec}
        onAutoExecChange={(next) => {
          setAutoExec(next);
        }}
      />

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
        session={wrappedSession}
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
