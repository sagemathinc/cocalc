import { type FindScopeContext } from "./types";

export function normalizeGlobQuery(query: string): string {
  if (/[\*\?\[]/.test(query)) return query;
  return `*${query}*`;
}

export function stripDotSlash(path: string): string {
  if (path.startsWith("/")) return path.slice(1);
  if (path.startsWith("./")) return path.slice(2);
  return path;
}

export function matchesScope(path: string, scopePath: string): boolean {
  const cleanPath = stripDotSlash(path);
  const cleanScope = stripDotSlash(scopePath);
  if (!cleanScope) return true;
  if (cleanPath === cleanScope) return true;
  return cleanPath.startsWith(`${cleanScope}/`);
}

export function parseSnapshotPaths(
  paths: string[],
  scopePath: string,
  snapshotName?: string,
) {
  const results: {
    snapshot: string;
    path: string;
    filter: string;
  }[] = [];
  for (const raw of paths) {
    const clean = stripDotSlash(raw);
    const parts = clean.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const snapshot = parts[0];
    if (snapshotName && snapshotName !== snapshot) continue;
    const rest = parts.slice(1);
    if (scopePath) {
      const scopeParts = scopePath.split("/").filter(Boolean);
      const matches = scopeParts.every((part, idx) => rest[idx] === part);
      if (!matches) continue;
      const relative = rest.slice(scopeParts.length).join("/");
      results.push({
        snapshot,
        path: relative,
        filter: `${snapshot} ${relative}`.trim(),
      });
    } else {
      results.push({
        snapshot,
        path: rest.join("/"),
        filter: `${snapshot} ${rest.join("/")}`.trim(),
      });
    }
  }
  return results;
}

export function parseSnapshotContentResults(
  results: {
    filename: string;
    description: string;
    line_number: number;
    filter: string;
  }[],
  scopePath: string,
  snapshotName?: string,
) {
  const output: {
    snapshot: string;
    path: string;
    line_number?: number;
    description?: string;
    filter: string;
  }[] = [];
  for (const result of results) {
    const clean = stripDotSlash(result.filename);
    const parts = clean.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const snapshot = parts[0];
    if (snapshotName && snapshotName !== snapshot) continue;
    const rest = parts.slice(1);
    if (scopePath) {
      const scopeParts = scopePath.split("/").filter(Boolean);
      const matches = scopeParts.every((part, idx) => rest[idx] === part);
      if (!matches) continue;
      const relative = rest.slice(scopeParts.length).join("/");
      output.push({
        snapshot,
        path: relative,
        line_number: result.line_number,
        description: result.description,
        filter: `${snapshot} ${relative} ${result.description}`.trim(),
      });
    } else {
      output.push({
        snapshot,
        path: rest.join("/"),
        line_number: result.line_number,
        description: result.description,
        filter: `${snapshot} ${rest.join("/")} ${result.description}`.trim(),
      });
    }
  }
  return output;
}

export function getScopeContext(scopePath: string): FindScopeContext {
  const clean = stripDotSlash(scopePath);
  if (clean === ".backups" || clean.startsWith(".backups/")) {
    const rest = clean.split("/").slice(1);
    const backupName = rest.length > 0 ? rest[0] : undefined;
    const innerPath = rest.length > 1 ? rest.slice(1).join("/") : "";
    return {
      kind: "backups",
      backupName,
      innerPath,
      homePath: innerPath,
    };
  }
  if (clean === ".snapshots" || clean.startsWith(".snapshots/")) {
    const rest = clean.split("/").slice(1);
    const snapshotName = rest.length > 0 ? rest[0] : undefined;
    const innerPath = rest.length > 1 ? rest.slice(1).join("/") : "";
    return {
      kind: "snapshots",
      snapshotName,
      innerPath,
      homePath: innerPath,
    };
  }
  return { kind: "normal", homePath: scopePath };
}
