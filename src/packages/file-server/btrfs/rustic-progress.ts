type ProgressUnit = "bytes" | "count";

export type RusticProgressDetail = {
  prefix?: string;
  bytes_done?: number;
  bytes_total?: number;
  count_done?: number;
  count_total?: number;
  speed?: number;
  eta?: number;
  elapsed?: number;
};

export type RusticProgressUpdate = {
  message: string;
  progress?: number;
  detail?: RusticProgressDetail;
  done?: boolean;
};

const ANSI_RE = /\x1b\[[0-9;]*m/g;

const BYTE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1_000,
  mb: 1_000_000,
  gb: 1_000_000_000,
  tb: 1_000_000_000_000,
  pb: 1_000_000_000_000_000,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4,
  pib: 1024 ** 5,
};

type ParsedProgress = {
  prefix: string;
  message: string;
  value: number;
  total?: number;
  unit: ProgressUnit;
  done: boolean;
};

type LastValue = {
  value: number;
  total?: number;
  ts: number;
  unit: ProgressUnit;
};

function stripAnsi(line: string): string {
  return line.replace(ANSI_RE, "");
}

function parseValue(raw: string): { value: number; unit: ProgressUnit } | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([0-9]*\.?[0-9]+)\s*([A-Za-z]+)?$/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const unitRaw = match[2];
  if (!unitRaw) {
    return { value, unit: "count" };
  }
  const unitKey = unitRaw.toLowerCase();
  const factor = BYTE_UNITS[unitKey];
  if (!factor) return null;
  return { value: value * factor, unit: "bytes" };
}

function parseRusticLine(line: string): ParsedProgress | null {
  const cleaned = stripAnsi(line).trim();
  if (!cleaned) return null;
  const withoutLevel = cleaned.replace(/^\[[A-Z]+\]\s*/, "");
  const colonIdx = withoutLevel.indexOf(":");
  if (colonIdx === -1) return null;
  const prefix = withoutLevel.slice(0, colonIdx).trim();
  const restRaw = withoutLevel.slice(colonIdx + 1).trim();
  if (!prefix || !restRaw) return null;

  let rest = restRaw;
  let done = false;
  const doneMatch = rest.match(/^(.*)\s+done in\s+(.+)$/i);
  if (doneMatch) {
    rest = doneMatch[1].trim();
    done = true;
  }

  const parts = rest.split("/");
  const valuePart = parts[0]?.trim() ?? "";
  const totalPart = parts.length > 1 ? parts.slice(1).join("/").trim() : "";

  const value = parseValue(valuePart);
  if (!value) return null;
  const total = totalPart ? parseValue(totalPart) : null;
  const totalValue =
    total && total.unit === value.unit ? total.value : undefined;

  return {
    prefix,
    message: `${prefix}: ${restRaw}`,
    value: value.value,
    total: totalValue,
    unit: value.unit,
    done,
  };
}

export function createRusticProgressHandler({
  onProgress,
  minIntervalMs = 1000,
}: {
  onProgress: (update: RusticProgressUpdate) => void;
  minIntervalMs?: number;
}): (line: string) => void {
  const lastByPrefix = new Map<string, LastValue>();
  let lastEmit = 0;
  let lastMessage = "";
  let lastProgress: number | undefined;

  return (line: string) => {
    const parsed = parseRusticLine(line);
    if (!parsed) return;
    const now = Date.now();

    const detail: RusticProgressDetail = { prefix: parsed.prefix };
    if (parsed.unit === "bytes") {
      detail.bytes_done = parsed.value;
      if (parsed.total != null) {
        detail.bytes_total = parsed.total;
      }
    } else {
      detail.count_done = parsed.value;
      if (parsed.total != null) {
        detail.count_total = parsed.total;
      }
    }

    const prev = lastByPrefix.get(parsed.prefix);
    if (prev && parsed.unit === "bytes") {
      const delta = parsed.value - prev.value;
      const dt = now - prev.ts;
      if (delta > 0 && dt >= minIntervalMs) {
        const speed = delta / (dt / 1000);
        if (Number.isFinite(speed) && speed > 0) {
          detail.speed = speed;
          if (parsed.total != null) {
            detail.eta = Math.max(
              0,
              Math.round(((parsed.total - parsed.value) / speed) * 1000),
            );
          }
        }
      }
    }
    lastByPrefix.set(parsed.prefix, {
      value: parsed.value,
      total: parsed.total,
      ts: now,
      unit: parsed.unit,
    });

    let progress: number | undefined;
    if (parsed.total != null && parsed.total > 0) {
      progress = (parsed.value / parsed.total) * 100;
      if (Number.isFinite(progress)) {
        progress = Math.max(0, Math.min(100, progress));
      }
    } else if (parsed.done) {
      progress = 100;
    }

    const progressChange =
      progress != null && lastProgress != null
        ? Math.abs(progress - lastProgress)
        : undefined;
    if (
      !parsed.done &&
      now - lastEmit < minIntervalMs &&
      progressChange != null &&
      progressChange < 0.5 &&
      parsed.message === lastMessage
    ) {
      return;
    }

    lastEmit = now;
    lastMessage = parsed.message;
    if (progress != null) {
      lastProgress = progress;
    }

    onProgress({
      message: parsed.message,
      progress,
      detail: Object.keys(detail).length ? detail : undefined,
      done: parsed.done,
    });
  };
}
