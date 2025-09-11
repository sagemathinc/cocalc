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
import { execFileSync, execSync } from "child_process";
import { writeFile, stat, unlink, mkdir, chmod } from "fs/promises";
import { join } from "path";
import { packageDirectorySync } from "package-directory";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("files:sandbox:install");

const binPath = join(
  packageDirectorySync({ cwd: __dirname }) ?? "",
  "node_modules",
  ".bin",
);

interface Spec {
  nonFatal?: boolean; // true if failure to install is non-fatal
  VERSION?: string;
  BASE?: string;
  binary?: string;
  path: string;
  stripComponents?: number;
  pathInArchive?: string;
  skip?: string[];
  script?: string;
  platforms?: string[];
  fix?: string;
}

const NSJAIL_VERSION = "3.4";

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
  dust: {
    // See https://github.com/bootandy/dust/releases
    VERSION: "v1.2.3",
    BASE: "https://github.com/bootandy/dust/releases/download",
    binary: "dust",
    path: join(binPath, "dust"),
    // github binaries exists for x86 mac only, which is dead - in homebrew.
    platforms: ["linux"],
  },
  ouch: {
    // See https://github.com/ouch-org/ouch/releases
    VERSION: "0.6.1",
    BASE: "https://github.com/ouch-org/ouch/releases/download",
    binary: "ouch",
    path: join(binPath, "ouch"),
    // See https://github.com/ouch-org/ouch/issues/45; note that ouch is in home brew
    // for this platform.
    skip: ["aarch64-apple-darwin"],
  },
  rustic: {
    // See https://github.com/rustic-rs/rustic/releases
    VERSION: "v0.9.5",
    BASE: "https://github.com/rustic-rs/rustic/releases/download",
    binary: "rustic",
    path: join(binPath, "rustic"),
    stripComponents: 0,
    pathInArchive: "rustic",
  },
  nsjail: {
    nonFatal: true,
    platforms: ["linux"],
    VERSION: NSJAIL_VERSION,
    BASE: "https://github.com/google/nsjail/releases",
    path: join(binPath, "nsjail"),
    fix: "sudo apt-get update && sudo apt-get install -y autoconf bison flex gcc g++ git libprotobuf-dev libnl-route-3-dev libtool make pkg-config protobuf-compiler libseccomp-dev",
    script: `cd /tmp && rm -rf /tmp/nsjail && git clone --branch ${NSJAIL_VERSION} --depth 1 --single-branch https://github.com/google/nsjail.git  && cd nsjail && make -j8 && strip nsjail && cp nsjail ${join(binPath, "nsjail")} && rm -rf /tmp/nsjail`,
  },
};

export const ripgrep = SPEC.ripgrep.path;
export const fd = SPEC.fd.path;
export const dust = SPEC.dust.path;
export const rustic = SPEC.rustic.path;
export const ouch = SPEC.ouch.path;
export const nsjail = SPEC.nsjail.path;

type App = keyof typeof SPEC;

// https://github.com/sharkdp/fd/releases/download/v10.2.0/fd-v10.2.0-x86_64-unknown-linux-musl.tar.gz
// https://github.com/BurntSushi/ripgrep/releases/download/14.1.1/ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz

export async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function alreadyInstalled(app: App) {
  return await exists(SPEC[app].path);
}

export async function install(app?: App) {
  if (app == null) {
    // @ts-ignore
    await Promise.all(Object.keys(SPEC).map(install));
    return;
  }

  if (await alreadyInstalled(app)) {
    return;
  }

  const spec = SPEC[app] as Spec;

  if (spec.platforms != null && !spec.platforms?.includes(platform())) {
    return;
  }

  const { script } = spec;
  try {
    if (script) {
      try {
        execSync(script);
      } catch (err) {
        if (spec.fix) {
          console.warn(`BUILD OF ${app} FAILED: Suggested fix -- ${spec.fix}`);
        }
        throw err;
      }
      if (!(await alreadyInstalled(app))) {
        throw Error(`failed to install ${app}`);
      }
      return;
    }

    const url = getUrl(app);
    if (!url) {
      logger.debug("install: skipping ", app);
      return;
    }
    logger.debug("install", { app, url });
    // - 1. Fetch the tarball from the github url (using the fetch library)
    const response = await downloadFromGithub(url);
    const tarballBuffer = Buffer.from(await response.arrayBuffer());

    // - 2. Extract the file "rg" from the tarball to ${__dirname}/rg
    // The tarball contains this one file "rg" at the top level, i.e., for
    //   ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz
    // we have "tar tvf ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz" outputs
    //    ...
    //    ripgrep-14.1.1-x86_64-unknown-linux-musl/rg

    const {
      VERSION,
      binary,
      path,
      stripComponents = 1,
      pathInArchive = app == "ouch"
        ? `${app}-${getOS()}/${binary}`
        : `${app}-${VERSION}-${getOS()}/${binary}`,
    } = spec;

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
        `--strip-components=${stripComponents}`,
        `-C`,
        binPath,
        pathInArchive,
      ]);

      // - 3. Make the file rg executable
      await chmod(path, 0o755);
    } finally {
      try {
        await unlink(tmpFile);
      } catch {}
    }
  } catch (err) {
    if (spec.nonFatal) {
      console.log(`WARNING: unable to install ${app}`, err);
    } else {
      throw err;
    }
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
        `Fetch ${url} failed. Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Should not reach here");
}

function getUrl(app: App) {
  const { BASE, VERSION, skip } = SPEC[app] as Spec;
  const os = getOS();
  if (skip?.includes(os)) {
    return "";
  }
  if (app == "ouch") {
    return `${BASE}/${VERSION}/${app}-${os}.tar.gz`;
  } else {
    return `${BASE}/${VERSION}/${app}-${VERSION}-${os}.tar.gz`;
  }
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
