/*
Adapters for ACP tool execution.

These interfaces decouple Codex from the underlying execution model so we can
swap local (host) implementations for container / project-host versions
without changing the handler logic.
*/

import type { TerminalExitStatus } from "@agentclientprotocol/sdk/dist/schema";

export type FileAdapter = {
  toString: () => string;
  // Read the full UTF-8 text contents of an absolute path.
  readTextFile(path: string): Promise<string>;
  // Write UTF-8 text to an absolute path, replacing any existing contents.
  writeTextFile(path: string, content: string): Promise<void>;
};

export type TerminalStartOptions = {
  terminalId: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  sessionId?: string;
  // Optional output limit to stop streaming after a threshold.
  limit?: number;
};

export type TerminalHandle = {
  // Stop the running process (SIGTERM/SIGKILL policy is up to the adapter).
  kill(): Promise<void>;
  // Wait for the process to exit and return status plus any buffered output.
  waitForExit(): Promise<{
    exitStatus: TerminalExitStatus;
    output?: string;
    truncated?: boolean;
  }>;
};

export type TerminalAdapter = {
  toString: () => string;
  // Start a command. onOutput is invoked for streamed stdout/stderr chunks.
  start(
    options: TerminalStartOptions,
    onOutput: (chunk: string) => Promise<void> | void,
  ): Promise<TerminalHandle>;
};

export type PathResolution = {
  // Absolute path that should be used for file/terminal operations.
  absolute: string;
  // Absolute path on the host filesystem (if different from `absolute`, e.g.,
  // when running inside a container and the host has a different mount point).
  hostAbsolute?: string;
  // Optional relative path for presenting in UI/logging.
  relative?: string;
  // Workspace root used for this resolution, e.g., "/root" in a container.
  workspaceRoot?: string;
};

export type PathResolver = {
  toString: () => string;
  resolve(filePath: string): PathResolution;
};
