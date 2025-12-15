import path from "node:path";
import type { CodexSessionConfig } from "@cocalc/util/ai/codex";

export function preferContainerExecutor(): boolean {
  // Explicit opt-in to container executor; default remains local to avoid
  // surprises in lite/single-user mode.
  return process.env.COCALC_ACP_EXECUTOR === "container";
}

export function resolveWorkspaceRoot(
  config: CodexSessionConfig | undefined,
  projectId?: string,
): string {
  const requested = config?.workingDirectory;
  if (projectId && preferContainerExecutor()) {
    // Container path: base project root plus optional relative working dir.
    // [ ] TODO: this is of course not right YET -- we need to use the
    // file-server module.
    const base = `/projects/${projectId}`;
    if (!requested) return base;
    return path.posix.isAbsolute(requested)
      ? requested
      : path.posix.normalize(path.posix.join(base, requested));
  }
  // Lite/local mode: respect absolute working dir, otherwise resolve from cwd.
  if (!requested) return process.cwd();
  return path.isAbsolute(requested)
    ? requested
    : path.resolve(process.cwd(), requested);
}
