/*
Download a ripgrep binary.

This supports:

- x86_64 Linux
- aarch64 Linux
- arm64 macos

This assumes tar is installed.

NOTE: There are several npm modules that purport to install ripgrep.  We do not use
https://www.npmjs.com/package/@vscode/ripgrep because it is not properly maintained,
e.g.,
  - security vulnerabilities: https://github.com/microsoft/ripgrep-prebuilt/issues/48
  - not updated to a major new release without a good reason: https://github.com/microsoft/ripgrep-prebuilt/issues/38
*/

import { arch, platform } from "os";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { execFileSync } from "child_process";
import { writeFile, unlink, chmod } from "fs/promises";
import { join } from "path";

// See https://github.com/BurntSushi/ripgrep/releases
const VERSION = "14.1.1";
const BASE = "https://github.com/BurntSushi/ripgrep/releases/download";

export const rgPath = join(__dirname, "rg");

export async function install() {
  if (await exists(rgPath)) {
    return;
  }
  const url = getUrl();
  // - 1. Fetch the tarball from the github url (using the fetch library)
  const response = await downloadFromGithub(url);
  const tarballBuffer = Buffer.from(await response.arrayBuffer());

  // - 2. Extract the file "rg" from the tarball to ${__dirname}/rg
  // The tarball contains this one file "rg" at the top level, i.e., for
  //   ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz
  // we have "tar tvf ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz" outputs
  //    ...
  //    ripgrep-14.1.1-x86_64-unknown-linux-musl/rg
  const tmpFile = join(__dirname, `ripgrep-${VERSION}.tar.gz`);
  await writeFile(tmpFile, tarballBuffer);
  // sync is fine since this is run at *build time*.
  execFileSync("tar", [
    "xzf",
    tmpFile,
    "--strip-components=1",
    `-C`,
    __dirname,
    `ripgrep-${VERSION}-${getName()}/rg`,
  ]);
  await unlink(tmpFile);

  // - 3. Make the file rg executable
  await chmod(rgPath, 0o755);
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

function getUrl() {
  return `${BASE}/${VERSION}/ripgrep-${VERSION}-${getName()}.tar.gz`;
}

function getName() {
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
