/*
Download a ripgrep or fd binary for the operating system

This supports x86_64/arm64 linux & macos

This assumes tar is installed.

NOTE: There are several npm modules that purport to install ripgrep.  We do not use
https://www.npmjs.com/package/@vscode/ripgrep because it is not properly maintained,
e.g.,
  - security vulnerabilities: https://github.com/microsoft/ripgrep-prebuilt/issues/48
  - not updated to a major new release without a good reason: https://github.com/microsoft/ripgrep-prebuilt/issues/38

NOTE: there is a linux program "upx", which can be run on any of these binaries
(except ssh where it is already run), which makes them self-extracting executables.
The binaries become less than half their size, but startup time is typically
increased to about 100ms to do the decompression every time.  We're not currently
using this, but it could be useful in some contexts, maybe.   The main value in
these programs isn't that they are small, but that:

- they are all statically linked, so run anywhere (e.g., in any container)
- they are fast (newer, in rust/go) often using parallelism well
*/

import { arch, platform } from "os";
import { split } from "@cocalc/util/misc";
import { execFileSync, execSync } from "child_process";
import { executeCode } from "@cocalc/backend/execute-code";
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
  pathInArchive?: () => string;
  skip?: string[];
  script?: () => string;
  platforms?: string[];
  fix?: string;
  url?: () => string;
  // if given, a bash shell line to run whose LAST output
  // (split by whitespace) is the version
  getVersion: string;
}

export const SPEC = {
  rg: {
    // See https://github.com/BurntSushi/ripgrep/releases
    VERSION: "14.1.1",
    BASE: "https://github.com/BurntSushi/ripgrep/releases/download",
    binary: "rg",
    path: join(binPath, "rg"),
    getVersion: "rg --version | head -n 1 | awk '{ print $2 }'",
    url: () =>
      `${SPEC.rg.BASE}/${SPEC.rg.VERSION}/ripgrep-${SPEC.rg.VERSION}-${getOS()}.tar.gz`,
    pathInArchive: () =>
      `ripgrep-${SPEC.rg.VERSION}-${getOS()}/${SPEC.rg.binary}`,
  },
  fd: {
    // See https://github.com/sharkdp/fd/releases
    VERSION: "v10.2.0",
    getVersion: `fd --version | awk '{print "v"$2}'`,
    BASE: "https://github.com/sharkdp/fd/releases/download",
    binary: "fd",
    path: join(binPath, "fd"),
  },
  dust: {
    // See https://github.com/bootandy/dust/releases
    VERSION: "v1.2.3",
    getVersion: `dust --version | awk '{print "v"$2}'`,
    BASE: "https://github.com/bootandy/dust/releases/download",
    binary: "dust",
    path: join(binPath, "dust"),
    // github binaries exists for x86 mac only, which is dead - in homebrew.
    platforms: ["linux"],
  },
  ouch: {
    // See https://github.com/ouch-org/ouch/releases
    VERSION: "0.6.1",
    getVersion: "ouch --version",
    BASE: "https://github.com/ouch-org/ouch/releases/download",
    binary: "ouch",
    path: join(binPath, "ouch"),
    // See https://github.com/ouch-org/ouch/issues/45; note that ouch is in home brew
    // for this platform.
    platforms: ["linux"],
    url: () => {
      const os = getOS();
      return `${SPEC.ouch.BASE}/${SPEC.ouch.VERSION}/ouch-${os}.tar.gz`;
    },
    pathInArchive: () => `ouch-${getOS()}/${SPEC.ouch.binary}`,
  },
  rustic: {
    // See https://github.com/rustic-rs/rustic/releases
    VERSION: "v0.10.2-1-g189b17c",
    getVersion: "rustic --version",
    BASE: "https://github.com/rustic-rs/rustic/releases/download",
    binary: "rustic",
    path: join(binPath, "rustic"),
    stripComponents: 0,
    pathInArchive: () => "rustic",
    url: () => {
      // the URL is a mess for current version!
      if (platform() == "linux") {
        if (arch() == "x64") {
          return "https://github.com/rustic-rs/rustic/releases/download/v0.10.2/rustic-v0.10.2-1-g189b17c-x86_64-unknown-linux-musl.tar.gz";
        } else {
          return "https://github.com/rustic-rs/rustic/releases/download/v0.10.2/rustic-v0.10.2-1-aarch64-unknown-linux-musl.tar.gz";
        }
      } else if (platform() == "darwin") {
        if (arch() == "x64") {
          return "https://github.com/rustic-rs/rustic/releases/download/v0.10.2/rustic-v0.10.2-1-g189b17c-x86_64-apple-darwin.tar.gz";
        } else {
          return "https://github.com/rustic-rs/rustic/releases/download/v0.10.2/rustic-v0.10.2-1-aarch64-apple-darwin.tar.gz";
        }
      }
    },
  },
  // sshpiper -- used by the core
  // See https://github.com/sagemathinc/sshpiper-binaries/releases
  sshpiper: {
    optional: true,
    desc: "sshpiper reverse proxy for sshd",
    path: join(binPath, "sshpiperd"),
    // this is what --version outputs and is the sha hash of HEAD:
    VERSION: "7fdd88982",
    getVersion: "sshpiperd --version | awk '{print $4}' | cut -c 1-9",
    script: () => {
      // this is the actual version in our release page
      const VERSION = "v1.5.0";
      const a = arch() == "x64" ? "amd64" : arch();
      return `curl -L https://github.com/sagemathinc/sshpiper-binaries/releases/download/${VERSION}/sshpiper-${VERSION}-${platform()}-${a}.tar.xz | tar -xJ -C "${binPath}" --strip-components=1`;
    },
    url: () => {
      const VERSION = SPEC.sshpiper.VERSION;
      // https://github.com/sagemathinc/sshpiper-binaries/releases/download/v1.5.0/sshpiper-v1.5.0-darwin-amd64.tar.xz
      return `sshpiper-${VERSION}-${arch() == "x64" ? "amd64" : arch()}.tar.xz`;
    },
    BASE: "https://github.com/sagemathinc/sshpiper-binaries/releases",
  },

  btm: {
    optional: true,
    // See https://github.com/ClementTsang/bottom/releases
    VERSION: "0.11.1",
    getVersion: "btm --version",
    BASE: "https://github.com/ClementTsang/bottom/releases/download",
    platforms: ["linux"],
    binary: "btm",
    script: () => {
      const VERSION = SPEC.btm.VERSION;
      const url = `${SPEC.btm.BASE}/${VERSION}/bottom_${getOS()}.tar.gz`;
      return `curl -L ${url} | tar -xz -C ${binPath} btm`;
    },
    path: join(binPath, "btm"),
  },

  dropbear: {
    desc: "Dropbear Statically Linked SSH Server ",
    platforms: ["linux"],
    VERSION: "v2025.88",
    getVersion: "dropbear -V",
    path: join(binPath, "dropbear"),
    // we grab just the dropbear binary out of the release; we don't
    // need any of the others:
    script: () =>
      `curl -L https://github.com/sagemathinc/dropbear/releases/download/main/dropbear-$(uname -m)-linux-musl.tar.xz | tar -xJ -C ${binPath} --strip-components=1 dropbear-$(uname -m)-linux-musl/dropbear`,
  },
  /*
   Locate the latest binaries are here:
     https://github.com/sagemathinc/static-openssh-binaries/releases
   E.g., the files look like
    https://github.com/sagemathinc/static-openssh-binaries/releases/download/OpenSSH_9.9p2/openssh-static-x86_64-small-2025-10-02b.tar.gz
    https://github.com/sagemathinc/static-openssh-binaries/releases/download/OpenSSH_9.9p2/openssh-static-aarch64-small-2025-10-02b.tar.gz
   and they extract like this:
~# tar xvf openssh-static-x86_64-small-OpenSSH_9.9p2.tar.gz
openssh/
openssh/sbin/
openssh/sbin/sshd
openssh/etc/
openssh/etc/sshd_config
openssh/bin/
openssh/bin/ssh-add
openssh/bin/sftp
openssh/bin/ssh-keyscan
openssh/bin/ssh-keygen
openssh/bin/ssh-agent
openssh/bin/ssh
openssh/bin/scp
openssh/var/
openssh/var/empty/
openssh/libexec/
openssh/libexec/ssh-keysign
openssh/libexec/sshd-session
openssh/libexec/sftp-server

To build a new version figure out what version (say OpenSSH_9.9p2)
happens to be being built, then do

   git tag OpenSSH_9.9p2
   git push --tags

to make a binary with that version

---
*/
  ssh: {
    desc: "statically linked compressed openssh binaries: ssh, scp, ssh-keygen",
    path: join(binPath, "ssh"),
    platforms: ["linux"],
    VERSION: "OpenSSH_9.9p2",
    getVersion: "ssh -V 2>&1 | cut -f 1 -d ','",
    script: () =>
      `curl -L https://github.com/sagemathinc/static-openssh-binaries/releases/download/${SPEC.ssh.VERSION}/openssh-static-$(uname -m)-small-${SPEC.ssh.VERSION}.tar.gz | tar -xz -C ${binPath} --strip-components=2 openssh/bin/ssh openssh/bin/ssh-keygen openssh/libexec/sftp-server`,
  },

  // See https://github.com/moparisthebest/static-curl/releases
  //
  // https://github.com/moparisthebest/static-curl/releases/download/v8.11.0/curl-amd64
  // https://github.com/moparisthebest/static-curl/releases/download/v8.11.0/curl-aarch64
  curl: {
    desc: "statically linked curl",
    path: join(binPath, "curl"),
    platforms: ["linux"],
    getVersion: "curl --version | head -n 1 | cut -f 2 -d ' '",
    VERSION: "8.11.0",
    script: () =>
      `curl -L https://github.com/moparisthebest/static-curl/releases/download/v${SPEC.curl.VERSION}/curl-${arch() == "x64" ? "amd64" : arch()} > ${join(binPath, "curl")} && chmod a+x ${join(binPath, "curl")}`,
  },

  // See https://github.com/sagemathinc/bees-binaries/releases
  bees: {
    desc: "Bees dedup binary for Ubuntu with minimal deps",
    path: join(binPath, "bees"),
    platforms: ["linux"],
    VERSION: "2024-10-04a",
    // https://github.com/sagemathinc/bees-binaries/releases/download/2024-10-04a/bees-2024-10-04a-x86_64-linux-glibc.tar.xz
    script: () => {
      const name = `bees-${SPEC.bees.VERSION}-${arch() == "x64" ? "x86_64" : arch()}-linux-glibc`;
      return `curl -L https://github.com/sagemathinc/bees-binaries/releases/download/${SPEC.bees.VERSION}/${name}.tar.xz | tar -xJ -C ${binPath} --strip-components=2 ${name}/bin/bees`;
    },
  },
  "reflect-sync": {
    optional: true,
    binary: "reflect-sync",
    path: join(binPath, "reflect-sync"),
  },
};

export const rg = SPEC.rg.path;
export const fd = SPEC.fd.path;
export const dust = SPEC.dust.path;
export const rustic = SPEC.rustic.path;
export const ouch = SPEC.ouch.path;
export const sshpiper = SPEC.sshpiper.path;
export const btm = SPEC.btm.path;
export const dropbear = SPEC.dropbear.path;
export const ssh = SPEC.ssh.path;
export const curl = SPEC.curl.path;

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

export async function installedVersion(app: App): Promise<string | undefined> {
  const { path, getVersion } = SPEC[app] as Spec;
  if (!(await exists(path))) {
    return;
  }
  if (!getVersion) {
    return;
  }
  try {
    const { stdout, stderr } = await executeCode({
      verbose: true,
      command: getVersion,
      env: { ...process.env, PATH: binPath + ":/usr/bin:" + process.env.PATH },
    });
    const v = split(stdout + stderr)
      .slice(-1)[0]
      .trim();
    return v;
  } catch (err) {
    logger.debug("WARNING: issue getting version", { path, getVersion, err });
  }
  return;
}

export async function versions() {
  const v: { [app: string]: string | undefined } = {};
  await Promise.all(
    Object.keys(SPEC).map(async (app) => {
      v[app] = await installedVersion(app as App);
    }),
  );
  return v;
}

export async function alreadyInstalled(app: App) {
  const { path, VERSION } = SPEC[app] as Spec;
  if (!(await exists(path))) {
    return false;
  }
  const v = await installedVersion(app);
  if (v == null) {
    // no version info
    return true;
  }
  return v == VERSION;
}

export async function install(
  app?: App,
  { optional }: { optional?: boolean } = {},
) {
  if (app == null) {
    if (!(await exists(binPath))) {
      await mkdir(binPath, { recursive: true });
    }
    // @ts-ignore
    await Promise.all(
      Object.keys(SPEC)
        .filter((x) => optional || !SPEC[x].optional)
        .map((x) => install(x as App, { optional })),
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
      const s = script();
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

    if (!(await exists(binPath))) {
      await mkdir(binPath, { recursive: true });
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

    const { VERSION, binary, path, stripComponents = 1, pathInArchive } = spec;

    const archivePath =
      pathInArchive?.() ?? `${app}-${VERSION}-${getOS()}/${binary}`;

    const tmpFile = join(__dirname, `${app}-${VERSION}.tar.gz`);
    try {
      await writeFile(tmpFile, tarballBuffer);
      // sync is fine since this is run at *build time*.
      execFileSync("tar", [
        "xzf",
        tmpFile,
        `--strip-components=${stripComponents}`,
        `-C`,
        binPath,
        archivePath,
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
    return spec.url();
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
