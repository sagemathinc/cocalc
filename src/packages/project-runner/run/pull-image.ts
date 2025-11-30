// PTY-based Podman pull with progress parsing.
import { spawn } from "@lydell/node-pty";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("project-runner:pull-image");

type Report = (x: { progress: number; desc: string }) => void;

export interface PullOptions {
  image: string;
  reportProgress: Report;
  timeout?: number; // ms, default 3_600_000
  extraArgs?: string[]; // e.g. ["--authfile", "/path/to/auth.json"]
  storageOptIgnoreChownErrors?: boolean; // default true
  env?: NodeJS.ProcessEnv; // optional overrides
  cols?: number; // pty columns (default 120)
  rows?: number; // pty rows (default 40)
}

/**
 * Pull an image with Podman and stream a synthetic 0..100 progress value.
 *
 * Heuristics:
 * - Prefer byte-weighted progress when we can parse "X / Y" sizes for layers.
 * - Otherwise, count steps (copying N layers/config/manifest/signatures) and
 *   distribute progress across discovered steps.
 *
 * Not perfect, but feels linear and looks good in a UI.
 */

export default async function podmanPullWithProgressPTY({
  image,
  reportProgress = () => {},
  timeout = 3_600_000,
  extraArgs = [],
  storageOptIgnoreChownErrors = true,
  env,
  cols = 120,
  rows = 40,
}: PullOptions): Promise<void> {
  const args: string[] = [];
  if (storageOptIgnoreChownErrors) {
    args.push("--storage-opt", "ignore_chown_errors=true");
  }
  args.push("pull", image, ...extraArgs);

  // Ensure a deterministic, UTF-8 locale and a reasonable terminal.
  const childEnv = {
    ...process.env,
    LC_ALL: "C.UTF-8",
    LANG: "C.UTF-8",
    TERM: "xterm",
    // Some tools gate progress on COLUMNS
    COLUMNS: String(cols),
    LINES: String(rows),
    ...env,
  };

  // node-pty merges stdout/stderr into a single "data" stream (like a real TTY).
  const cmd = "podman";
  const p = spawn(cmd, args, {
    name: "xterm",
    cols,
    rows,
    cwd: process.cwd(),
    env: childEnv,
  });

  // --- Progress tracking ---
  interface LayerProgress {
    transferred: number; // bytes
    total?: number; // bytes
    done?: boolean;
  }
  const layers = new Map<string, LayerProgress>();
  let totalStepsDiscovered = 0;
  let stepsDone = 0;

  function parseSize(num: string, unit: string): number {
    const v = parseFloat(num);
    const u = unit.toLowerCase();
    const table: Record<string, number> = {
      b: 1,
      kb: 1e3,
      kib: 1024,
      mb: 1e6,
      mib: 1024 ** 2,
      gb: 1e9,
      gib: 1024 ** 3,
    };
    const key =
      u === "b"
        ? "b"
        : u.includes("kib")
          ? "kib"
          : u.includes("kb")
            ? "kb"
            : u.includes("mib")
              ? "mib"
              : u.includes("mb")
                ? "mb"
                : u.includes("gib")
                  ? "gib"
                  : "gb";
    return v * table[key];
  }

  function computeOverall(): number {
    let totalBytes = 0;
    let doneBytes = 0;
    let haveTotals = false;
    for (const lp of layers.values()) {
      if (lp.total && lp.total > 0 && Number.isFinite(lp.total)) {
        haveTotals = true;
        totalBytes += lp.total;
        doneBytes += Math.min(lp.transferred, lp.total);
      }
    }
    if (haveTotals && totalBytes > 0) {
      return Math.max(1, Math.min(100, (doneBytes / totalBytes) * 100));
    }
    if (totalStepsDiscovered > 0) {
      return Math.max(
        1,
        Math.min(100, (stepsDone / totalStepsDiscovered) * 100),
      );
    }
    return 7;
  }

  let lastEmit = 0;
  const emitIntervalMs = 750;
  function emit(desc: string) {
    const now = Date.now();
    if (now - lastEmit < emitIntervalMs) return;
    lastEmit = now;
    const progress = Math.round(computeOverall());
    logger.debug("pullImage: reportProgress", { image, progress });
    reportProgress({ progress, desc });
  }

  // Regexes tuned for PTY progress lines, e.g.:
  // "Copying blob 83f9d7e5d96f ... [=====>-----] 13.4MiB / 100.0MiB | 11.4 MiB/s"
  // They can appear with CR-overwrites; we normalize below.
  const reProgress =
    /(Copying (?:blob|config)[^\r\n]*?)(\d+(?:\.\d+)?)\s*(kB|KB|KiB|MB|MiB|GB|GiB)\s*\/\s*(\d+(?:\.\d+)?)\s*(kB|KB|KiB|MB|MiB|GB|GiB)/i;
  const reCopyingId =
    /Copying (?:blob|config)\s+(?:sha256:)?([a-f0-9]{12,64})/i;
  const rePlainDone = /\bdone\b/i;
  const reManifest = /Writing manifest/i;
  const reSignatures = /Storing signatures/i;

  // PTY streams often use CR to repaint a single line. We'll split on both.
  let buf = "";
  function handleChunk(data: string) {
    buf += data;
    // Replace in-line carriage-return updates with newlines to preserve last state.
    buf = buf.replace(/\r(?!\n)/g, "\n");
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) onLine(line);
    }
  }

  function onLine(line: string) {
    // 1) Byte progress
    const m = reProgress.exec(line);
    if (m) {
      const [, , cur, curUnit, tot, totUnit] = m;
      const idMatch = reCopyingId.exec(line);
      const id = idMatch ? idMatch[1] : `__anon_${layers.size}`;
      const transferred = parseSize(cur, curUnit);
      const total = parseSize(tot, totUnit);
      const lp = layers.get(id) ?? { transferred: 0 };
      lp.transferred = Math.max(lp.transferred, transferred);
      lp.total = total;
      layers.set(id, lp);
      emit(`pulling ${image}…`);
      return;
    }

    // 2) Discovery & done markers
    const idMatch = reCopyingId.exec(line);
    if (idMatch) {
      const id = idMatch[1];
      if (!layers.has(id)) {
        layers.set(id, { transferred: 0 });
        totalStepsDiscovered += 1;
      }
      if (rePlainDone.test(line)) {
        const lp = layers.get(id)!;
        if (!lp.done) {
          lp.done = true;
          stepsDone += 1;
          // If we know total, snap transferred to total.
          if (lp.total) lp.transferred = lp.total;
        }
      }
      emit(`pulling ${image}…`);
      return;
    }

    // 3) Manifest/signatures as pseudo-steps
    const pseudo = reManifest.test(line)
      ? "__step_manifest"
      : reSignatures.test(line)
        ? "__step_signatures"
        : undefined;
    if (pseudo) {
      if (!layers.has(pseudo)) {
        layers.set(pseudo, { transferred: 0 });
        totalStepsDiscovered += 1;
      }
      if (rePlainDone.test(line)) {
        const lp = layers.get(pseudo)!;
        if (!lp.done) {
          lp.done = true;
          stepsDone += 1;
        }
      }
      emit(`pulling ${image}…`);
      return;
    }

    // 4) Generic "done" nudge
    if (rePlainDone.test(line)) {
      emit(`pulling ${image}…`);
    }
  }

  // Wire stream
  p.onData((d) => handleChunk(d.toString()));

  // Initial UI nudge
  reportProgress({ progress: 1, desc: `pulling ${image}…` });

  // Timeout + await exit
  let resolved = false;
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        p.kill();
      } catch {}
      if (!resolved)
        reject(
          new Error(
            `podman pull timed out after ${Math.round(timeout / 1000)}s`,
          ),
        );
    }, timeout);

    p.onExit(({ exitCode, signal }) => {
      clearTimeout(timer);
      if (resolved) return;
      if (exitCode === 0) {
        resolved = true;
        resolve();
      } else {
        reject(
          new Error(
            `podman pull exited with code ${exitCode}${signal ? ` (signal ${signal})` : ""}`,
          ),
        );
      }
    });
  });

  try {
    await done;
  } finally {
    // Ensure the last state is flushed.
  }

  reportProgress({ progress: 100, desc: `pulled ${image}` });
}
