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
): string {
  const requested = config?.workingDirectory;
  if (preferContainerExecutor()) {
    // Container path: always anchor to /root inside the project. Ignore
    // absolute paths outside /root to avoid leaking host paths from the
    // caller; treat them as relative segments under /root instead.
    const base = `/root`;
    if (!requested) return base;
    // Normalize and strip any leading slashes; also drop leading ../ segments.
    const withoutLeadingSlash = requested.replace(/^\/+/, "");
    const noParentSegments = withoutLeadingSlash.replace(/^(\.\.\/)+/, "");
    if (!noParentSegments) return base;
    // If the caller passed an absolute path under /root, respect it as-is.
    if (requested.startsWith(base)) {
      return path.posix.normalize(requested);
    }
    return path.posix.normalize(path.posix.join(base, noParentSegments));
  }
  // Lite/local mode: respect absolute working dir, otherwise resolve from cwd.
  if (!requested) return process.cwd();
  return path.isAbsolute(requested)
    ? requested
    : path.resolve(process.cwd(), requested);
}
