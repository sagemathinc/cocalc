/*
share-viewer: a lightweight client-side only way of 
rendering cocalc's content.

Client-only share viewer app used by the static share domain.
It loads the latest manifest from R2, renders directories, and provides
lightweight viewers for notebooks, markdown, code, and PDFs.
*/

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Markdown } from "@cocalc/frontend/markdown";
import NBViewer from "@cocalc/frontend/jupyter/nbviewer/nbviewer";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { codemirrorMode } from "@cocalc/frontend/file-extensions";
import { getExtension } from "@cocalc/util/misc-path";
import "katex/dist/katex.min.css";
import "codemirror/lib/codemirror.css";
import "@cocalc/frontend/_jupyter.sass";
import "./style.css";

type ShareScope = "public" | "unlisted" | "authenticated" | "org";
type ShareRootKind = "file" | "dir";
type ShareFileKind = "notebook" | "markdown" | "pdf" | "text" | "binary";

interface ShareManifestFile {
  path: string;
  hash: string;
  size: number;
  mtime: number;
  content_type: string;
  kind: ShareFileKind;
}

interface ShareManifest {
  version: number;
  share_id: string;
  manifest_id: string;
  created_at: string;
  root_path: string;
  root_kind: ShareRootKind;
  scope: ShareScope;
  indexing_opt_in: boolean;
  files: ShareManifestFile[];
  dirs?: string[];
  file_count?: number;
  size_bytes?: number;
}

interface ShareLatest {
  share_id: string;
  manifest_id: string;
  manifest_hash: string;
  share_region?: string | null;
  published_at: string;
  file_count?: number;
  size_bytes?: number;
}

interface ShareLocation {
  shareId: string;
  baseUrl: string;
  pathPrefix: string;
  initialPath: string;
  authToken?: string;
  hasBaseOverride: boolean;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; latest: ShareLatest; manifest: ShareManifest }
  | { status: "error"; error: string };

const ROOT_ID = "cocalc-webapp-container";

export function init(): void {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    throw new Error(`Missing #${ROOT_ID} container.`);
  }
  createRoot(root).render(<ShareViewerApp />);
}

function ShareViewerApp() {
  const [locationInfo, setLocationInfo] =
    useState<ShareLocation>(parseShareLocation);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [currentPath, setCurrentPath] = useState(locationInfo.initialPath);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!locationInfo.shareId) {
        setState({ status: "error", error: "Missing share id." });
        return;
      }
      try {
        setState({ status: "loading" });
        const latest = await fetchJson<ShareLatest>(
          buildShareUrl(locationInfo.baseUrl, "latest.json"),
          locationInfo.authToken,
        );
        const manifest = await fetchJson<ShareManifest>(
          buildShareUrl(
            locationInfo.baseUrl,
            "manifests",
            `${latest.manifest_id}.json`,
          ),
          locationInfo.authToken,
        );
        if (!active) return;
        setState({ status: "ready", latest, manifest });
      } catch (err) {
        if (!active) return;
        setState({
          status: "error",
          error: err instanceof Error ? err.message : `${err}`,
        });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [locationInfo]);

  useEffect(() => {
    if (state.status !== "ready") return;
    if (currentPath) return;
    if (state.manifest.root_kind === "file" && state.manifest.files.length) {
      setCurrentPath(state.manifest.files[0].path);
    }
  }, [state, currentPath]);

  useEffect(() => {
    const handler = () => {
      setCurrentPath(parsePathFromLocation(locationInfo.pathPrefix));
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [locationInfo.pathPrefix]);

  useEffect(() => {
    if (state.status !== "ready") return;
    if (locationInfo.hasBaseOverride) return;
    const region = state.latest.share_region;
    if (!region) return;
    const nextPrefix = buildRegionedPrefix(region, locationInfo.shareId);
    if (!nextPrefix || nextPrefix === locationInfo.pathPrefix) return;
    const url = new URL(window.location.href);
    const pathSuffix = currentPath ? `/${encodePath(currentPath)}` : "";
    url.pathname = nextPrefix + pathSuffix || "/";
    url.searchParams.delete("path");
    window.history.replaceState({}, "", url.toString());
    setLocationInfo((prev) => ({
      ...prev,
      pathPrefix: nextPrefix,
      baseUrl: normalizeBaseUrl(nextPrefix),
    }));
  }, [state, locationInfo, currentPath]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const title = currentPath
      ? `${currentPath} · CoCalc Share`
      : "CoCalc Share";
    document.title = title;
  }, [state, currentPath]);

  const navigate = useCallback(
    (nextPath: string) => {
      const url = new URL(window.location.href);
      const pathSuffix = nextPath ? `/${encodePath(nextPath)}` : "";
      const prefix = locationInfo.pathPrefix || "";
      url.pathname = prefix + pathSuffix || "/";
      url.searchParams.delete("path");
      window.history.pushState({}, "", url.toString());
      setCurrentPath(nextPath);
    },
    [locationInfo.pathPrefix],
  );

  if (state.status === "loading") {
    return (
      <Layout>
        <StatusCard title="Loading share">
          Pulling the latest published snapshot...
        </StatusCard>
      </Layout>
    );
  }

  if (state.status === "error") {
    return (
      <Layout>
        <StatusCard title="Share unavailable">{state.error}</StatusCard>
      </Layout>
    );
  }

  const { manifest, latest } = state;
  const entry = manifest.files.find((file) => file.path === currentPath);
  const isDir = entry ? false : isDirectoryPath(manifest.files, currentPath);

  return (
    <Layout>
      <Header
        shareId={locationInfo.shareId}
        latest={latest}
        currentPath={currentPath}
        onNavigate={navigate}
      />
      {entry ? (
        <FileView
          entry={entry}
          baseUrl={locationInfo.baseUrl}
          token={locationInfo.authToken}
        />
      ) : isDir ? (
        <DirectoryView
          currentPath={currentPath}
          files={manifest.files}
          onNavigate={navigate}
        />
      ) : (
        <StatusCard title="Path not found">
          The requested path does not exist in this share.
        </StatusCard>
      )}
    </Layout>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return <div className="sv-root">{children}</div>;
}

function Header({
  shareId,
  latest,
  currentPath,
  onNavigate,
}: {
  shareId: string;
  latest: ShareLatest;
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const crumbs = buildCrumbs(currentPath);
  return (
    <div className="sv-header">
      <div>
        <div className="sv-brand">CoCalc Share</div>
        <div className="sv-subtitle">Share {shareId}</div>
      </div>
      <div className="sv-meta">
        <div>Updated {formatDate(latest.published_at)}</div>
        {latest.size_bytes != null && (
          <div>{formatBytes(latest.size_bytes)}</div>
        )}
      </div>
      <div className="sv-path">
        <button
          type="button"
          className="sv-crumb"
          onClick={() => onNavigate("")}
        >
          Home
        </button>
        {crumbs.map((crumb) => (
          <button
            key={crumb.path}
            type="button"
            className="sv-crumb"
            onClick={() => onNavigate(crumb.path)}
          >
            {crumb.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="sv-card sv-status">
      <div className="sv-card-title">{title}</div>
      <div className="sv-card-body">{children}</div>
    </div>
  );
}

function DirectoryView({
  currentPath,
  files,
  onNavigate,
}: {
  currentPath: string;
  files: ShareManifestFile[];
  onNavigate: (path: string) => void;
}) {
  const entries = useMemo(
    () => buildDirectoryEntries(files, currentPath),
    [files, currentPath],
  );

  if (!entries.length) {
    return (
      <StatusCard title="Empty directory">
        Nothing to show in this folder.
      </StatusCard>
    );
  }

  return (
    <div className="sv-card">
      <div className="sv-card-title">
        Directory {currentPath ? `/${currentPath}` : "/"}
      </div>
      <div className="sv-card-body">
        <ul className="sv-list">
          {entries.map((entry, index) => (
            <li
              key={`${entry.kind}:${entry.path}`}
              className="sv-list-item"
              style={{ ["--delay" as any]: `${index * 40}ms` } as CSSProperties}
            >
              <button
                type="button"
                className="sv-link"
                onClick={() => onNavigate(entry.path)}
              >
                <span className="sv-entry-icon">
                  {entry.kind === "dir" ? "▣" : "◆"}
                </span>
                <span>{entry.name}</span>
              </button>
              {entry.kind === "file" && entry.file ? (
                <span className="sv-entry-meta">
                  {formatBytes(entry.file.size)}
                </span>
              ) : (
                <span className="sv-entry-meta">Folder</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FileView({
  entry,
  baseUrl,
  token,
}: {
  entry: ShareManifestFile;
  baseUrl: string;
  token?: string;
}) {
  const blobUrl = buildShareUrl(baseUrl, "blobs", entry.hash);
  return (
    <div className="sv-card sv-file">
      <div className="sv-card-title">
        <span>{entry.path}</span>
        <a className="sv-download" href={blobUrl} download>
          Download
        </a>
      </div>
      <div className="sv-file-meta">
        <span>{formatBytes(entry.size)}</span>
        <span>Modified {formatDate(entry.mtime)}</span>
        <span>{entry.content_type}</span>
      </div>
      <div className="sv-card-body">
        <FileContent entry={entry} blobUrl={blobUrl} token={token} />
      </div>
    </div>
  );
}

function FileContent({
  entry,
  blobUrl,
  token,
}: {
  entry: ShareManifestFile;
  blobUrl: string;
  token?: string;
}) {
  if (entry.content_type.startsWith("image/")) {
    return <img className="sv-media" src={blobUrl} alt={entry.path} />;
  }
  if (entry.content_type.startsWith("audio/")) {
    return <audio className="sv-media" controls src={blobUrl} />;
  }
  if (entry.content_type.startsWith("video/")) {
    return <video className="sv-media" controls src={blobUrl} />;
  }
  if (entry.kind === "pdf") {
    return <iframe className="sv-pdf" src={blobUrl} title={entry.path} />;
  }
  if (entry.kind === "binary") {
    return (
      <div className="sv-empty">Preview is not available for this file.</div>
    );
  }

  return <TextContent entry={entry} blobUrl={blobUrl} token={token} />;
}

function TextContent({
  entry,
  blobUrl,
  token,
}: {
  entry: ShareManifestFile;
  blobUrl: string;
  token?: string;
}) {
  const [content, setContent] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setStatus("loading");
        const text = await fetchText(blobUrl, token);
        if (!active) return;
        setContent(text);
        setStatus("ready");
      } catch {
        if (!active) return;
        setStatus("error");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [blobUrl, token]);

  if (status === "loading") {
    return <div className="sv-empty">Loading file...</div>;
  }
  if (status === "error") {
    return <div className="sv-empty">Unable to load this file.</div>;
  }

  if (entry.kind === "notebook") {
    return <NBViewer content={content} />;
  }
  if (entry.kind === "markdown") {
    return <Markdown value={content} />;
  }

  const mode = codemirrorMode(getExtension(entry.path));
  return (
    <CodeMirrorStatic
      value={content}
      options={{ mode, lineNumbers: true, lineWrapping: true }}
      font_size={14}
    />
  );
}

type DirectoryEntry =
  | { kind: "dir"; name: string; path: string }
  | { kind: "file"; name: string; path: string; file: ShareManifestFile };

function buildDirectoryEntries(
  files: ShareManifestFile[],
  currentPath: string,
): DirectoryEntry[] {
  const prefix = currentPath ? `${currentPath}/` : "";
  const dirs = new Map<string, DirectoryEntry>();
  const items: DirectoryEntry[] = [];

  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length);
    if (!rest) continue;
    const parts = rest.split("/");
    const name = parts[0];
    if (!name) continue;
    if (parts.length > 1) {
      if (!dirs.has(name)) {
        dirs.set(name, {
          kind: "dir",
          name,
          path: prefix ? `${prefix}${name}` : name,
        });
      }
    } else {
      items.push({
        kind: "file",
        name,
        path: prefix ? `${prefix}${name}` : name,
        file,
      });
    }
  }

  const orderedDirs = Array.from(dirs.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const orderedFiles = items.sort((a, b) => a.name.localeCompare(b.name));
  return [...orderedDirs, ...orderedFiles];
}

function isDirectoryPath(files: ShareManifestFile[], path: string): boolean {
  const prefix = path ? `${path}/` : "";
  return files.some((file) => file.path.startsWith(prefix));
}

function buildCrumbs(path: string): Array<{ label: string; path: string }> {
  if (!path) return [];
  const parts = path.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; path: string }> = [];
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    crumbs.push({ label: part, path: current });
  }
  return crumbs;
}

function parseShareLocation(): ShareLocation {
  const url = new URL(window.location.href);
  const override = resolveShareBaseOverride();
  const segments = url.pathname.split("/").filter(Boolean);
  let shareId = "";
  let prefixSegments: string[] = [];
  let pathSegments: string[] = [];

  if (segments[0] === "r") {
    if (segments[1] && (segments[2] === "share" || segments[2] === "s")) {
      shareId = segments[3] ?? "";
      prefixSegments = segments.slice(0, 4);
      pathSegments = segments.slice(4);
    }
  } else if (segments[0] === "share" || segments[0] === "s") {
    shareId = segments[1] ?? "";
    prefixSegments = segments.slice(0, 2);
    pathSegments = segments.slice(2);
  } else {
    shareId = segments[0] ?? "";
    prefixSegments = segments.slice(0, 1);
    pathSegments = segments.slice(1);
  }

  const pathPrefix = prefixSegments.length
    ? `/${prefixSegments.join("/")}`
    : "";
  const rawPath = url.searchParams.get("path");
  const decodedPath = rawPath
    ? rawPath
    : pathSegments.map(decodeURIComponent).join("/");
  const initialPath = normalizePath(decodedPath);
  const baseUrl = normalizeBaseUrl(override ?? pathPrefix);
  const authToken = resolveAuthToken(url);
  const hasBaseOverride = Boolean(override);

  return {
    shareId,
    baseUrl,
    pathPrefix,
    initialPath,
    authToken,
    hasBaseOverride,
  };
}

function parsePathFromLocation(pathPrefix: string): string {
  const url = new URL(window.location.href);
  const rawPath = url.searchParams.get("path");
  if (rawPath != null) {
    return normalizePath(rawPath);
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const prefixParts = pathPrefix.split("/").filter(Boolean);
  const pathSegments = segments.slice(prefixParts.length);
  return normalizePath(pathSegments.map(decodeURIComponent).join("/"));
}

function resolveShareBaseOverride(): string | undefined {
  const meta = document.querySelector(
    'meta[name="cocalc-share-base"]',
  ) as HTMLMetaElement | null;
  if (meta?.content) return meta.content;
  const win = (window as any).__COCALC_SHARE_BASE__;
  return typeof win === "string" ? win : undefined;
}

function resolveAuthToken(url: URL): string | undefined {
  const win = (window as any).__COCALC_SHARE_TOKEN__;
  if (typeof win === "string" && win) return win;
  return (
    url.searchParams.get("token") ??
    url.searchParams.get("share_token") ??
    undefined
  );
}

function buildRegionedPrefix(region: string, shareId: string): string {
  const cleanRegion = region.trim();
  const cleanShareId = shareId.trim();
  if (!cleanRegion || !cleanShareId) return "";
  return `/r/${encodeURIComponent(cleanRegion)}/share/${encodeURIComponent(cleanShareId)}`;
}

function normalizeBaseUrl(input: string): string {
  if (!input) return "";
  const url = new URL(input, window.location.origin);
  return url.toString().replace(/\/+$/, "");
}

function normalizePath(path: string): string {
  if (!path) return "";
  const parts = path.split("/").map((part) => part.trim());
  const filtered = parts.filter(
    (part) => part && part !== "." && part !== "..",
  );
  return filtered.join("/");
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function buildShareUrl(base: string, ...parts: string[]): string {
  const cleanBase = base.replace(/\/+$/, "");
  const cleanParts = parts.map((part) =>
    part.replace(/^\/+/, "").replace(/\/+$/, ""),
  );
  return [cleanBase, ...cleanParts].filter(Boolean).join("/");
}

async function fetchJson<T>(url: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function fetchText(url: string, token?: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return await response.text();
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value < 10 && idx > 0 ? 1 : 0)} ${units[idx]}`;
}

function formatDate(input: string | number): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}
