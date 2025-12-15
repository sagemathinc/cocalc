import path from "node:path";
import type { CodexSessionConfig } from "@cocalc/util/ai/codex";

let preferContainerOverride: boolean | undefined;

export function setPreferContainerExecutor(force: boolean): void {
  preferContainerOverride = force;
}

export function preferContainerExecutor(): boolean {
  // Explicit opt-in to container executor; default remains local to avoid
  // surprises in lite/single-user mode.
  if (preferContainerOverride !== undefined) return preferContainerOverride;
  return process.env.COCALC_ACP_EXECUTOR === "container";
}

export function resolveWorkspaceRoot(
  config: CodexSessionConfig | undefined,
  projectId?: string,
): string {
  const requested = config?.workingDirectory;
  if (projectId && preferContainerExecutor()) {
    // Container path: project HOME plus optional relative working dir.
    // (project containers run as root; adjust if that ever changes)
    const base = `/root`;
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
