import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import getLogger from "@cocalc/backend/logger";
import type {
  SoftwareUpgradeTarget,
  UpgradeSoftwareRequest,
  UpgradeSoftwareResponse,
  UpgradeSoftwareResult,
  SoftwareArtifact,
  SoftwareChannel,
} from "@cocalc/conat/project-host/api";

const logger = getLogger("project-host:upgrade");

const DEFAULT_BASE_URL = "https://software.cocalc.ai/software";
const DEFAULT_BUNDLE_ROOT = "/opt/cocalc/project-bundles";
const DEFAULT_TOOLS_ROOT = "/opt/cocalc/tools";
const PROJECT_HOST_ROOT = "/opt/cocalc/project-host";

type CanonicalArtifact = "project-host" | "project" | "tools";

type ResolvedArtifact = {
  artifact: SoftwareArtifact;
  canonicalArtifact: CanonicalArtifact;
  version: string;
  url: string;
  sha256?: string;
  stripComponents: number;
  root: string;
  versionDir: string;
  currentLink: string;
};

function normalizeBaseUrl(baseUrl?: string): string {
  const raw =
    baseUrl ??
    process.env.COCALC_PROJECT_HOST_SOFTWARE_BASE_URL ??
    DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function canonicalizeArtifact(artifact: SoftwareArtifact): CanonicalArtifact {
  if (artifact === "project-bundle") return "project";
  return artifact;
}

function normalizeArch(): string {
  if (process.arch === "x64") return "x86_64";
  if (process.arch === "arm64") return "arm64";
  return process.arch;
}

function normalizeOs(): string {
  if (process.platform === "linux") return "linux";
  if (process.platform === "darwin") return "darwin";
  return process.platform;
}

function extractVersionFromUrl(url: string, artifact: CanonicalArtifact) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(new RegExp(`/${artifact}/([^/]+)/`));
    return match?.[1];
  } catch {
    return undefined;
  }
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url} failed (${res.status})`);
  }
  return await res.json();
}

async function fetchSha256(url: string): Promise<string | undefined> {
  const res = await fetch(url);
  if (!res.ok) return undefined;
  const text = await res.text();
  const token = text.trim().split(/\s+/)[0];
  return token || undefined;
}

function resolveDownloadsRoot(): string {
  const dataDir = process.env.COCALC_DATA ?? process.env.DATA;
  if (dataDir) {
    return path.join(dataDir, "cache", "software-downloads");
  }
  return path.join(os.tmpdir(), "cocalc-software-downloads");
}

async function downloadToFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`download failed (${res.status})`);
  }
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const body = Readable.fromWeb(res.body as any);
  await pipeline(body, fs.createWriteStream(dest));
}

async function sha256File(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function runTar(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("tar", args, { stdio: "pipe" });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `tar failed with code ${code}`));
      }
    });
  });
}

async function replaceSymlink(linkPath: string, target: string) {
  const tmp = `${linkPath}.tmp-${Date.now()}`;
  try {
    const stat = await fs.promises.lstat(linkPath);
    if (stat.isSymbolicLink() || stat.isFile()) {
      await fs.promises.unlink(linkPath);
    } else if (stat.isDirectory()) {
      await fs.promises.rm(linkPath, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
  await fs.promises.symlink(target, tmp);
  await fs.promises.rename(tmp, linkPath);
}

async function resolveArtifact(
  target: SoftwareUpgradeTarget,
  baseUrl: string,
): Promise<ResolvedArtifact> {
  const artifact = target.artifact;
  const canonicalArtifact = canonicalizeArtifact(artifact);
  let url = "";
  let sha256: string | undefined;
  let version = target.version;
  if (!version) {
    const channel: SoftwareChannel = target.channel ?? "latest";
    const manifestUrl = `${baseUrl}/${canonicalArtifact}/${channel}.json`;
    const manifest = await fetchJson(manifestUrl);
    url = manifest?.url ?? "";
    sha256 = manifest?.sha256;
    version = extractVersionFromUrl(url, canonicalArtifact);
  } else {
    const arch = normalizeArch();
    const os = normalizeOs();
    if (canonicalArtifact === "project-host") {
      url = `${baseUrl}/project-host/${version}/cocalc-project-host-${version}-${arch}-${os}.tar.xz`;
    } else if (canonicalArtifact === "project") {
      url = `${baseUrl}/project/${version}/bundle.tar.xz`;
    } else {
      url = `${baseUrl}/tools/${version}/tools.tar.xz`;
    }
  }
  if (!url) {
    throw new Error(`unable to resolve ${artifact} url`);
  }
  if (!sha256) {
    sha256 = await fetchSha256(`${url}.sha256`);
  }
  if (!version) {
    version = extractVersionFromUrl(url, canonicalArtifact) ?? "unknown";
  }
  const root =
    canonicalArtifact === "project-host"
      ? PROJECT_HOST_ROOT
      : canonicalArtifact === "project"
        ? process.env.COCALC_PROJECT_BUNDLES ?? DEFAULT_BUNDLE_ROOT
        : process.env.COCALC_PROJECT_TOOLS
          ? path.dirname(process.env.COCALC_PROJECT_TOOLS)
          : DEFAULT_TOOLS_ROOT;
  const stripComponents = canonicalArtifact === "project-host" ? 2 : 1;
  const versionDir =
    canonicalArtifact === "project-host"
      ? path.join(root, "versions", version)
      : path.join(root, version);
  const currentLink = path.join(root, "current");
  return {
    artifact,
    canonicalArtifact,
    version,
    url,
    sha256,
    stripComponents,
    root,
    versionDir,
    currentLink,
  };
}

function currentVersion(linkPath: string): string | undefined {
  try {
    const resolved = fs.realpathSync(linkPath);
    const base = path.basename(resolved);
    if (base && base !== "current") return base;
  } catch {
    // ignore
  }
  return undefined;
}

async function downloadAndInstall(
  resolved: ResolvedArtifact,
): Promise<UpgradeSoftwareResult> {
  const existing = currentVersion(resolved.currentLink);
  if (existing && existing === resolved.version) {
    return {
      artifact: resolved.artifact,
      version: resolved.version,
      status: "noop",
    };
  }
  await fs.promises.mkdir(resolved.root, { recursive: true });
  const downloadsRoot = resolveDownloadsRoot();
  const archivePath = path.join(
    downloadsRoot,
    `${resolved.canonicalArtifact}-${resolved.version}.tar.xz`,
  );
  logger.info("upgrade: downloading artifact", {
    artifact: resolved.artifact,
    version: resolved.version,
    url: resolved.url,
  });
  await downloadToFile(resolved.url, archivePath);
  if (resolved.sha256) {
    const actual = await sha256File(archivePath);
    if (actual !== resolved.sha256) {
      throw new Error(
        `sha256 mismatch for ${resolved.artifact} (${resolved.version})`,
      );
    }
  }
  await fs.promises.rm(resolved.versionDir, { recursive: true, force: true });
  await fs.promises.mkdir(resolved.versionDir, { recursive: true });
  await runTar([
    "-xJf",
    archivePath,
    `--strip-components=${resolved.stripComponents}`,
    "-C",
    resolved.versionDir,
  ]);
  await replaceSymlink(resolved.currentLink, resolved.versionDir);
  return { artifact: resolved.artifact, version: resolved.version, status: "updated" };
}

async function scheduleHostRestart() {
  const candidate = path.join(PROJECT_HOST_ROOT, "current", "cocalc-project-host");
  const bin = fs.existsSync(candidate)
    ? candidate
    : path.join(PROJECT_HOST_ROOT, "cocalc-project-host");
  const cmd = `${bin} daemon stop || true; ${bin} daemon start`;
  const child = spawn("bash", ["-c", cmd], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  logger.info("upgrade: scheduled project-host restart");
}

function orderTargets(targets: SoftwareUpgradeTarget[]): SoftwareUpgradeTarget[] {
  const order: SoftwareArtifact[] = [
    "tools",
    "project",
    "project-bundle",
    "project-host",
  ];
  return [...targets].sort(
    (a, b) => order.indexOf(a.artifact) - order.indexOf(b.artifact),
  );
}

export async function upgradeSoftware(
  opts: UpgradeSoftwareRequest,
): Promise<UpgradeSoftwareResponse> {
  const targets = orderTargets(opts.targets ?? []);
  if (!targets.length) {
    throw new Error("upgrade requires at least one target");
  }
  const baseUrl = normalizeBaseUrl(opts.base_url);
  const results: UpgradeSoftwareResult[] = [];
  let restartHost = false;
  for (const target of targets) {
    const resolved = await resolveArtifact(target, baseUrl);
    const result = await downloadAndInstall(resolved);
    results.push(result);
    if (resolved.artifact === "project-host" && result.status === "updated") {
      restartHost = true;
    }
  }
  if (restartHost) {
    await scheduleHostRestart();
  }
  return { results };
}
