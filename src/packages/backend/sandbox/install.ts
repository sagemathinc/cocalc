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
// using old version of pkg-dir because of nextjs :-(
import { sync as packageDirectorySync } from "pkg-dir";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("files:sandbox:install");

const pkgDir = packageDirectorySync(__dirname) ?? "";

const binPath = join(pkgDir, "node_modules", ".bin");

interface Spec {
  nonFatal?: boolean; // true if failure to install is non-fatal
  VERSION?: string;
  BASE?: string;
  binary?: string;
  path: string;
  stripComponents?: number;
  pathInArchive?: string;
  skip?: string[];
  script?: (spec: Spec) => string;
  platforms?: string[];
  fix?: string;
  url?: (spec: Spec) => string;
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
    url: ({ BASE, VERSION }) => {
      const os = getOS();
      return `${BASE}/${VERSION}/ouch-${os}.tar.gz`;
    },
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
    optional: true,
    nonFatal: true,
    platforms: ["linux"],
    VERSION: NSJAIL_VERSION,
    BASE: "https://github.com/google/nsjail/releases",
    path: join(binPath, "nsjail"),
    fix: "sudo apt-get update && sudo apt-get install -y autoconf bison flex gcc g++ git libprotobuf-dev libnl-route-3-dev libtool make pkg-config protobuf-compiler libseccomp-dev",
    script: `cd /tmp && rm -rf /tmp/nsjail && git clone --branch ${NSJAIL_VERSION} --depth 1 --single-branch https://github.com/google/nsjail.git  && cd nsjail && make -j8 && strip nsjail && cp nsjail ${join(binPath, "nsjail")} && rm -rf /tmp/nsjail`,
  },
  dropbear: {
    optional: true,
    desc: "Dropbear SSH Server",
    platforms: ["linux"],
    VERSION: "main",
    path: join(binPath, "dropbear"),
    // we grab just the dropbear binary out of the release; we don't
    // need any of the others:
    script: () =>
      `curl -L https://github.com/sagemathinc/dropbear/releases/download/main/dropbear-$(uname -m)-linux-musl.tar.xz | tar -xJ -C ${binPath} --strip-components=1 dropbear-$(uname -m)-linux-musl/dropbear`,
  },
  // See https://github.com/sagemathinc/sshpiper-binaries/releases
  sshpiper: {
    optional: true,
    desc: "sshpiper reverse proxy for sshd",
    path: join(binPath, "sshpiperd"),
    VERSION: "v1.5.0",
    script: ({ VERSION }) => {
      const a = arch() == "x64" ? "amd64" : arch();
      return `curl -L https://github.com/sagemathinc/sshpiper-binaries/releases/download/${VERSION}/sshpiper-${VERSION}-${platform()}-${a}.tar.xz | tar -xJ -C ${binPath} --strip-components=1`;
    },
    url: () => {
      const VERSION = "v1.5.0";
      // https://github.com/sagemathinc/sshpiper-binaries/releases/download/v1.5.0/sshpiper-v1.5.0-darwin-amd64.tar.xz
      /*
sshpiper-v1.5.0-darwin-amd64.tar.xz
sshpiper-v1.5.0-darwin-arm64.tar.xz
sshpiper-v1.5.0-linux-amd64.tar.xz
sshpiper-v1.5.0-linux-arm64.tar.xz
sshpiper-v1.5.0-windows-amd64.tar.xz
sshpiper-v1.5.0-windows-arm64.tar.xz
*/
      return `sshpiper-${VERSION}-${arch() == "x64" ? "amd64" : arch()}.tar.xz`;
    },
    BASE: "https://github.com/sagemathinc/sshpiper-binaries/releases",
  },
};

export const ripgrep = SPEC.ripgrep.path;
export const fd = SPEC.fd.path;
export const dust = SPEC.dust.path;
export const rustic = SPEC.rustic.path;
export const ouch = SPEC.ouch.path;
export const nsjail = SPEC.nsjail.path;
export const dropbear = SPEC.dropbear.path;
export const sshpiper = SPEC.sshpiper.path;

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
    await Promise.all(
      Object.keys(SPEC)
        .filter((x) => !SPEC[x].optional)
        .map(install as any),
    );
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
    if (script != null) {
      const s = script(spec);
      console.log(s);
      try {
        execSync(s);
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

      // - 3. Make the file executable
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
  const spec = SPEC[app] as Spec;
  if (spec.url != null) {
    return spec.url(spec);
  }
  const { BASE, VERSION, skip } = spec;
  const os = getOS();
  if (skip?.includes(os)) {
    return "";
  }
  // very common pattern with rust cli tools:
  return `${BASE}/${VERSION}/${app}-${VERSION}-${os}.tar.gz`;
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
