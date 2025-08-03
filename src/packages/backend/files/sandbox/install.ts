/*
Download a ripgrep or fd binary for the operating system

This supports x86_64/arm64 linux & macos

This assumes tar is installed.

NOTE: There are several npm modules that purport to install ripgrep.  We do not use
https://www.npmjs.com/package/@vscode/ripgrep because it is not properly maintained,
e.g.,
  - security vulnerabilities: https://github.com/microsoft/ripgrep-prebuilt/issues/48
  - not updated to a major new release without a good reason: https://github.com/microsoft/ripgrep-prebuilt/issues/38
*/

import { arch, platform } from "os";
import { execFileSync } from "child_process";
import { writeFile, stat, unlink, mkdir, chmod } from "fs/promises";
import { join } from "path";

const i = __dirname.lastIndexOf("packages/backend");
const binPath = join(
  __dirname.slice(0, i + "packages/backend".length),
  "node_modules/.bin",
);
export const ripgrep = join(binPath, "rg");
export const fd = join(binPath, "fd");

const SPEC = {
  ripgrep: {
    // See https://github.com/BurntSushi/ripgrep/releases
    VERSION: "14.1.1",
    BASE: "https://github.com/BurntSushi/ripgrep/releases/download",
    binary: "rg",
    path: join(binPath, "rg"),
  },
  fd: {
    // See https://github.com/sharkdp/fd/releases
    VERSION: "v10.2.0",
    BASE: "https://github.com/sharkdp/fd/releases/download",
    binary: "fd",
    path: join(binPath, "fd"),
  },
} as const;

type App = keyof typeof SPEC;

// https://github.com/sharkdp/fd/releases/download/v10.2.0/fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz
// https://github.com/BurntSushi/ripgrep/releases/download/14.1.1/ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function install(app?: App) {
  if (app == null) {
    await Promise.all([install("ripgrep"), install("fd")]);
    return;
  }
  if (app == "ripgrep" && (await exists(ripgrep))) {
    return;
  }
  if (app == "fd" && (await exists(fd))) {
    return;
  }
  const url = getUrl(app);
  // - 1. Fetch the tarball from the github url (using the fetch library)
  const response = await downloadFromGithub(url);
  const tarballBuffer = Buffer.from(await response.arrayBuffer());

  // - 2. Extract the file "rg" from the tarball to ${__dirname}/rg
  // The tarball contains this one file "rg" at the top level, i.e., for
  //   ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz
  // we have "tar tvf ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz" outputs
  //    ...
  //    ripgrep-14.1.1-x86_64-unknown-linux-musl/rg

  const { VERSION, binary, path } = SPEC[app];

  const tmpFile = join(__dirname, `${app}-${VERSION}.tar.gz`);
  try {
    try {
      if (!(await exists(binPath))) {
        await mkdir(binPath);
      }
    } catch {}
    await writeFile(tmpFile, tarballBuffer);
    // sync is fine since this is run at *build time*.
    execFileSync("tar", [
      "xzf",
      tmpFile,
      "--strip-components=1",
      `-C`,
      binPath,
      `${app}-${VERSION}-${getOS()}/${binary}`,
    ]);

    // - 3. Make the file rg executable
    await chmod(path, 0o755);
  } finally {
    try {
      await unlink(tmpFile);
    } catch {}
  }
}

// Download from github, but aware of rate limits, the retry-after header, etc.
async function downloadFromGithub(url: string) {
  const maxRetries = 10;
  const baseDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);

      if (res.status === 429) {
        // Rate limit error
        if (attempt === maxRetries) {
          throw new Error("Rate limit exceeded after max retries");
        }

        const retryAfter = res.headers.get("retry-after");
        const delay = retryAfter
          ? parseInt(retryAfter) * 1000
          : baseDelay * Math.pow(2, attempt - 1); // Exponential backoff

        console.log(
          `Rate limited. Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return res;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(
        `Fetch failed. Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Should not reach here");
}

function getUrl(app: App) {
  const { BASE, VERSION } = SPEC[app];
  return `${BASE}/${VERSION}/${app}-${VERSION}-${getOS()}.tar.gz`;
}

function getOS() {
  switch (platform()) {
    case "linux":
      switch (arch()) {
        case "x64":
          return "x86_64-unknown-linux-musl";
        case "arm64":
          return "aarch64-unknown-linux-gnu";
        default:
          throw Error(`unsupported arch '${arch()}'`);
      }
    case "darwin":
      switch (arch()) {
        case "x64":
          return "x86_64-apple-darwin";
        case "arm64":
          return "aarch64-apple-darwin";
        default:
          throw Error(`unsupported arch '${arch()}'`);
      }
    default:
      throw Error(`unsupported platform '${platform()}'`);
  }
}
