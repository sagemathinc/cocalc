#!/usr/bin/env node
/**
 * sync-mtime-ssh.ts — Node 24+, macOS & Linux
 *
 * Mirror mtimes (and optionally atimes) from SRC -> DST without copying content.
 * SRC/DST can be local absolute paths or SSH endpoints of the form:
 *   ssh://[user@]host[:port]/abs/path
 *
 * Features:
 * - Concurrency-limited stat/utimes; dry-run; JSON summary
 * - Include/Exclude regex filters
 * - Verify size matches before touching (default on)
 * - Symlink handling: skip | link | target
 * - Optional traversal through symlinked directories during collection (--follow)
 * - Remote collection prefers Node walker; falls back to find/stat (GNU/BSD aware)
 * - Remote apply streams JSONL manifest over SSH and runs a tiny Node applier
 */

import { promises as fsp } from "node:fs";
import * as fsCb from "node:fs";
import { join, resolve } from "node:path";
import { cpus } from "node:os";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";

/* ------------------------------ Types ------------------------------ */

type Endpoint =
  | { kind: "local"; path: string }
  | { kind: "ssh"; host: string; path: string };

type Kind = "f" | "d" | "l";

interface ManifestEntry {
  p: string; // relative path
  t: number; // mtime (ms epoch)
  a: number; // atime (ms epoch)
  k: Kind; // kind: file/dir/symlink
  s: number; // size (files only; 0 for dir/link)
}

interface Summary {
  touched: number;
  skippedMissing: number;
  skippedTypeMismatch: number;
  skippedUnchanged: number;
  skippedSizeMismatch: number;
  skippedSymlinkNoLutimes: number;
  skippedBrokenSymlink: number;
  errors: number;
}

/* ------------------------------ CLI ------------------------------ */

const { values: opts, positionals: rest } = parseArgs({
  options: {
    src: { type: "string" }, // endpoint
    dst: { type: "string" }, // endpoint
    concurrency: { type: "string" }, // number
    dirs: { type: "boolean", default: false },
    setAtime: { type: "boolean", default: false },
    tolerance: { type: "string", default: "1" },
    verifySize: { type: "boolean", default: true },
    exclude: { type: "string", multiple: true, default: [".git", ".mutagen"] },
    include: { type: "string", multiple: true, default: [] },
    follow: { type: "boolean", default: false }, // follow symlinks during collection
    symlinkMode: { type: "string", default: "skip" }, // skip|link|target
    dryRun: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    quiet: { type: "boolean", default: false },
    sshCmd: { type: "string", default: "ssh" },
    help: { type: "boolean", default: false },
  },
  strict: true,
  allowPositionals: true,
});

function help() {
  const defC = Math.max(8, cpus().length * 4);
  const msg = `sync-mtime-ssh — mirror mtimes between SRC and DST (local or SSH)

Usage:
  node sync-mtime-ssh.js --src <endpoint> --dst <endpoint> [options]

Endpoints:
  Local: /abs/path
  Remote: ssh://[user@]host[:port]/abs/path

Examples:
  # Remote -> Local
  node sync-mtime-ssh.js --src ssh://alice@host:/srv/A --dst /data/B --dirs --symlinkMode target
  # Local -> Remote
  node sync-mtime-ssh.js --src /data/A --dst ssh://bob@host:2222//srv/B --verifySize

Options:
  --concurrency <n>     Max parallel stat/utimes (default: ${defC})
  --dirs                Also sync directory mtimes
  --setAtime            Copy atime as well (default keeps dest atime)
  --tolerance <secs>    Ignore deltas <= tolerance (default: 1)
  --verifySize          Require same file size before touching (default: on)
  --exclude <regex>     Skip paths matching any (repeatable). Defaults: .git, .mutagen
  --include <regex>     If set, only consider paths matching any include regex
  --follow              Follow symlinks to directories during collection
  --symlinkMode <m>     skip | link | target  (default: skip)
  --dryRun              Show planned changes without writing
  --json                Emit JSON summary
  --quiet               Suppress per-file logs
  --sshCmd <bin>        SSH binary (default: ssh)
  --help                Show this help
`;
  process.stdout.write(msg);
}

if (opts.help) {
  help();
  process.exit(0);
}

const SRC = (opts.src ?? rest[0]) as string | undefined;
const DST = (opts.dst ?? rest[1]) as string | undefined;
if (!SRC || !DST) {
  console.error("Error: --src and --dst are required.");
  help();
  process.exit(2);
}

const CONCURRENCY = Math.max(
  1,
  opts.concurrency != null && Number.isFinite(+opts.concurrency)
    ? +opts.concurrency
    : Math.max(8, cpus().length * 4),
);
const TOL = Math.max(0, Number.isFinite(+opts.tolerance) ? +opts.tolerance : 1);
const EXCLUDES = (opts.exclude as string[]).map((s) => new RegExp(s));
const INCLUDES = (opts.include as string[]).map((s) => new RegExp(s));
const SYMLINK_MODE = (opts.symlinkMode as string) || "skip"; // "skip" | "link" | "target"

/* ------------------------------ Utils ------------------------------ */

function parseEndpoint(s: string): Endpoint {
  if (s.startsWith("ssh://")) {
    const m = s.match(/^ssh:\/\/([^/]+)(\/.*)$/);
    if (!m) throw new Error(`Invalid SSH endpoint: ${s}`);
    const host = m[1]; // [user@]host[:port]
    const path = m[2];
    if (!path.startsWith("/"))
      throw new Error(`SSH path must be absolute: ${s}`);
    return { kind: "ssh", host, path };
  } else {
    if (!s.startsWith("/"))
      throw new Error(`Local path must be absolute: ${s}`);
    return { kind: "local", path: resolve(s) };
  }
}
const srcEp = parseEndpoint(SRC);
const dstEp = parseEndpoint(DST);

function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    if (queue.length) queue.shift()!();
  };
  return <T,>(fn: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(
          (v) => {
            next();
            resolve(v);
          },
          (e) => {
            next();
            reject(e);
          },
        );
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
}

function shQ(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
function sshTarget(host: string): string {
  // [user@]host[:port] -> [user@]host
  const idx = host.lastIndexOf(":");
  if (idx >= 0 && !host.includes("@", idx)) return host.slice(0, idx);
  return host;
}
function sshPort(host: string): string {
  const idx = host.lastIndexOf(":");
  if (idx >= 0 && !host.includes("@", idx)) return host.slice(idx + 1);
  return "22";
}

function run(
  cmd: string,
  args: string[],
  input?: string,
): Promise<{ out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    if (input != null) p.stdin.end(input);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      if (code === 0) resolve({ out, err });
      else
        reject(
          new Error(`${cmd} ${args.join(" ")} exited ${code}: ${err || out}`),
        );
    });
  });
}

async function runSSHOk(host: string, cmd: string): Promise<boolean> {
  try {
    await run(opts.sshCmd as string, [
      "-p",
      sshPort(host),
      sshTarget(host),
      cmd,
    ]);
    return true;
  } catch {
    return false;
  }
}

async function* parseJSONLines(
  readable: NodeJS.ReadableStream,
): AsyncGenerator<any> {
  let buf = "";
  for await (const chunk of readable) {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        yield JSON.parse(line);
      } catch {
        // ignore
      }
    }
  }
  if (buf.trim()) {
    try {
      yield JSON.parse(buf);
    } catch {
      /* ignore */
    }
  }
}

function pathAllowed(rel: string): boolean {
  const incOK = INCLUDES.length === 0 || INCLUDES.some((r) => r.test(rel));
  if (!incOK) return false;
  if (EXCLUDES.some((r) => r.test(rel))) return false;
  return true;
}

/* ------------------------------ Collection ------------------------------ */

async function* collectManifest(ep: Endpoint): AsyncGenerator<ManifestEntry> {
  if (ep.kind === "local") yield* collectLocal(ep.path);
  else yield* collectRemote(ep.host, ep.path);
}

async function* collectLocal(root: string): AsyncGenerator<ManifestEntry> {
  const rootLen = root.endsWith("/") ? root.length : root.length + 1;
  const stack: string[] = [root];

  while (stack.length) {
    const dir = stack.pop()!;
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = abs.slice(rootLen);
      if (!pathAllowed(rel)) continue;

      if (e.isDirectory()) {
        const st = await fsp.lstat(abs);
        if (opts.dirs) {
          yield { p: rel, t: +st.mtime, a: +st.atime, k: "d", s: 0 };
        }
        stack.push(abs);
      } else if (e.isFile()) {
        const st = await fsp.lstat(abs);
        yield { p: rel, t: +st.mtime, a: +st.atime, k: "f", s: st.size };
      } else if (e.isSymbolicLink()) {
        const st = await fsp.lstat(abs);
        // Always emit the link object (apply phase decides how to handle)
        yield { p: rel, t: +st.mtime, a: +st.atime, k: "l", s: 0 };
        if (opts.follow) {
          // Best-effort: if target is a dir, walk into it; if file, also emit its file record
          try {
            const tgt = await fsp.stat(abs);
            if (tgt.isDirectory()) {
              stack.push(abs);
            } else if (tgt.isFile()) {
              yield {
                p: rel,
                t: +tgt.mtime,
                a: +tgt.atime,
                k: "f",
                s: tgt.size,
              };
            }
          } catch {
            /* broken/permission: ignore */
          }
        }
      }
    }
  }
}

async function* collectRemote(
  host: string,
  root: string,
): AsyncGenerator<ManifestEntry> {
  // Prefer Node-based walker remotely
  const nodeProbe = `node -e "process.exit(typeof require==='function' && process.versions?.node ? 0 : 1)"`;
  const probeOK = await runSSHOk(host, `cd ${shQ(root)} && ${nodeProbe}`).catch(
    () => false,
  );

  if (probeOK) {
    const walker = remoteNodeWalkerScript(
      Boolean(opts.dirs),
      Boolean(opts.follow),
      EXCLUDES,
      INCLUDES,
    );
    const cmd = `cd ${shQ(root)} && node -e ${shQ(walker)}`;
    const child = spawn(
      opts.sshCmd as string,
      ["-p", sshPort(host), sshTarget(host), cmd],
      {
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    yield* parseJSONLines(child.stdout);
    const code: number = await new Promise((res) => child.on("close", res));
    if (code !== 0)
      throw new Error(`Remote node walker failed with exit ${code}`);
    return;
  }

  // Fallback: find/stat (GNU vs BSD)
  const flavor = await detectRemoteStatFlavor(host);
  const cmd = remoteFindStatPipeline(
    root,
    flavor,
    Boolean(opts.dirs),
    EXCLUDES,
    INCLUDES,
  );
  const child = spawn(
    opts.sshCmd as string,
    ["-p", sshPort(host), sshTarget(host), cmd],
    {
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  yield* parseJSONLines(child.stdout);
  const code: number = await new Promise((res) => child.on("close", res));
  if (code !== 0)
    throw new Error(`Remote find/stat pipeline failed with exit ${code}`);
}

function remoteNodeWalkerScript(
  wantDirs: boolean,
  follow: boolean,
  excludes: RegExp[],
  includes: RegExp[],
): string {
  const ex = JSON.stringify(excludes.map((r) => r.source));
  const inc = JSON.stringify(includes.map((r) => r.source));
  return `
(async()=>{
  const fs=require('node:fs').promises;
  const path=require('node:path');
  const EX=${ex}.map(s=>new RegExp(s));
  const IN=${inc}.map(s=>new RegExp(s));
  function allowed(rel){return (IN.length===0||IN.some(r=>r.test(rel))) && !EX.some(r=>r.test(rel));}
  const root=process.cwd();
  const rootLen=root.endsWith('/')?root.length:root.length+1;
  const stack=[root];
  while(stack.length){
    const dir=stack.pop();
    const ents=await fs.readdir(dir,{withFileTypes:true});
    for (const e of ents){
      const abs=path.join(dir,e.name);
      const rel=abs.slice(rootLen);
      if(!allowed(rel)) continue;
      try{
        const st=await fs.lstat(abs);
        if (e.isDirectory()){
          ${wantDirs ? `process.stdout.write(JSON.stringify({p:rel,t:+st.mtime,a:+st.atime,k:'d',s:0})+'\\n');` : ""}
          stack.push(abs);
        } else if (e.isFile()){
          process.stdout.write(JSON.stringify({p:rel,t:+st.mtime,a:+st.atime,k:'f',s:st.size})+'\\n');
        } else if (e.isSymbolicLink()){
          process.stdout.write(JSON.stringify({p:rel,t:+st.mtime,a:+st.atime,k:'l',s:0})+'\\n');
          if (${follow}){
            try{
              const tgt=await fs.stat(abs);
              if (tgt.isDirectory()) stack.push(abs);
              else if (tgt.isFile()) process.stdout.write(JSON.stringify({p:rel,t:+tgt.mtime,a:+tgt.atime,k:'f',s:tgt.size})+'\\n');
            }catch{}
          }
        }
      }catch{}
    }
  }
})().catch(e=>{console.error(String(e));process.exit(1)});`;
}

async function detectRemoteStatFlavor(host: string): Promise<"gnu" | "bsd"> {
  const { out } = await run(opts.sshCmd as string, [
    "-p",
    sshPort(host),
    sshTarget(host),
    "stat --version || stat -f %H . || true",
  ]);
  if (/GNU coreutils/i.test(out)) return "gnu";
  return "bsd";
}

function remoteFindStatPipeline(
  root: string,
  flavor: "gnu" | "bsd",
  wantDirs: boolean,
  excludes: RegExp[],
  includes: RegExp[],
): string {
  const exParts = excludes
    .map((re) => `-regex ${shQ(".*" + re.source + ".*")} -prune`)
    .join(" -o ");
  const incFilter =
    includes.length === 0
      ? ""
      : ` | awk '{
           path=$0;
           ${includes.map((r) => `if (match(path,/${r.source}/)) m=1;`).join(" ")}
           if (m==1) print path; m=0;
         }'`;

  const baseFind = `cd ${shQ(root)} && find . -mindepth 1 ${exParts ? `\\( ${exParts} \\) -o` : ""} -print`;
  const classFilter = wantDirs
    ? ""
    : ` | while read p; do [ -d "$p" ] || echo "$p"; done`;

  let statCmd: string;
  if (flavor === "gnu") {
    statCmd = `while IFS= read -r p; do
      t=$(stat -c %Y "$p" 2>/dev/null) || continue
      a=$(stat -c %X "$p" 2>/dev/null) || a=$t
      s=$(stat -c %s "$p" 2>/dev/null) || s=0
      F=$(stat -c %F "$p" 2>/dev/null) || F=""
      k=""; case "$F" in
        "regular file") k="f" ;;
        "directory") k="d" ;;
        "symbolic link") k="l" ;;
        *) k="";;
      esac
      rel=\${p#./}
      echo "{\\"p\\":\\"$rel\\",\\"t\\":$t000,\\"a\\":$a000,\\"k\\":\\"$k\\",\\"s\\":$s}"
    done`;
  } else {
    statCmd = `while IFS= read -r p; do
      t=$(stat -f %m "$p" 2>/dev/null) || continue
      a=$(stat -f %a "$p" 2>/dev/null) || a=$t
      s=$(stat -f %z "$p" 2>/dev/null) || s=0
      H=$(stat -f %HT "$p" 2>/dev/null) || H=""
      k=""; case "$H" in
        "File") k="f" ;;
        "Directory") k="d" ;;
        "SymbolicLink") k="l" ;;
        *) k="";;
      esac
      rel=\${p#./}
      echo "{\\"p\\":\\"$rel\\",\\"t\\":$t000,\\"a\\":$a000,\\"k\\":\\"$k\\",\\"s\\":$s}"
    done`;
  }

  return `${baseFind}${incFilter}${classFilter} | ${statCmd}`;
}

/* ------------------------------ Apply (Local) ------------------------------ */

const hasLutimes = typeof (fsCb as any).lutimes === "function";

async function applyToLocal(
  root: string,
  iter: AsyncGenerator<ManifestEntry>,
): Promise<Summary> {
  const limit = pLimit(CONCURRENCY);
  const summary: Summary = {
    touched: 0,
    skippedMissing: 0,
    skippedTypeMismatch: 0,
    skippedUnchanged: 0,
    skippedSizeMismatch: 0,
    skippedSymlinkNoLutimes: 0,
    skippedBrokenSymlink: 0,
    errors: 0,
  };

  const tasks: Array<Promise<void>> = [];

  for await (const ent of iter) {
    const dstPath = join(root, ent.p);
    tasks.push(
      limit(async () => {
        try {
          let st = await fsp.lstat(dstPath).catch(() => null as any);
          if (!st) {
            summary.skippedMissing++;
            return;
          }

          let currentMtime = +st.mtime;
          let targetPath = dstPath;
          let atimeToSet = opts.setAtime ? new Date(ent.a) : st.atime;

          if (ent.k === "l") {
            // Ensure it's actually a link at destination
            if (!st.isSymbolicLink()) {
              summary.skippedTypeMismatch++;
              return;
            }
            if (SYMLINK_MODE === "skip") {
              return; // ignore links entirely
            } else if (SYMLINK_MODE === "link") {
              if (!hasLutimes) {
                summary.skippedSymlinkNoLutimes++;
                return;
              }
              // keep st as link stat (currentMtime already correct)
            } else if (SYMLINK_MODE === "target") {
              try {
                const tstat = await fsp.stat(dstPath); // follows link
                currentMtime = +tstat.mtime;
                // size check is ambiguous for "l" entries; we only verify size when manifest says file.
              } catch {
                summary.skippedBrokenSymlink++;
                return;
              }
            }
          } else if (
            (ent.k === "f" && !st.isFile()) ||
            (ent.k === "d" && !st.isDirectory())
          ) {
            summary.skippedTypeMismatch++;
            return;
          } else {
            if (opts.verifySize && ent.k === "f" && st.size !== ent.s) {
              summary.skippedSizeMismatch++;
              return;
            }
          }

          const delta = Math.abs(currentMtime - ent.t) / 1000;
          if (delta <= TOL) {
            summary.skippedUnchanged++;
            return;
          }

          if (!opts.dryRun) {
            if (ent.k === "l" && SYMLINK_MODE === "link") {
              // @ts-ignore lutimes isn't in node:fs/promises; use callback API
              await new Promise<void>((res, rej) =>
                (fsCb as any).lutimes(
                  dstPath,
                  atimeToSet,
                  new Date(ent.t),
                  (e: any) => (e ? rej(e) : res()),
                ),
              );
            } else {
              await fsp.utimes(targetPath, atimeToSet, new Date(ent.t));
            }
          }

          summary.touched++;
          if (!opts.quiet && !opts.json) {
            console.log(
              `${opts.dryRun ? "DRY " : ""}TOUCH ${dstPath} ${new Date(currentMtime).toISOString()} -> ${new Date(ent.t).toISOString()}`,
            );
          }
        } catch (e: any) {
          summary.errors++;
          if (!opts.quiet && !opts.json)
            console.error(`ERR  ${dstPath}: ${e?.message ?? e}`);
        }
      }),
    );
  }

  await Promise.all(tasks);
  return summary;
}

/* ------------------------------ Apply (Remote) ------------------------------ */

async function applyToRemote(
  host: string,
  root: string,
  iter: AsyncGenerator<ManifestEntry>,
): Promise<Summary> {
  const applyScript = remoteApplyScript({
    concurrency: CONCURRENCY,
    symlinkMode: SYMLINK_MODE as "skip" | "link" | "target",
    setAtime: Boolean(opts.setAtime),
    tolerance: TOL,
    verifySize: Boolean(opts.verifySize),
    dryRun: Boolean(opts.dryRun),
  });

  const child = spawn(
    opts.sshCmd as string,
    [
      "-p",
      sshPort(host),
      sshTarget(host),
      `cd ${shQ(root)} && node -e ${shQ(applyScript)}`,
    ],
    {
      stdio: ["pipe", "pipe", "inherit"],
    },
  );

  // Stream manifest JSONL to remote
  (async () => {
    for await (const o of iter) {
      child.stdin.write(JSON.stringify(o) + "\n");
    }
    child.stdin.end();
  })().catch(() => {
    try {
      child.stdin.end();
    } catch {}
  });

  const out: string = await new Promise((res, rej) => {
    let buf = "";
    child.stdout.on("data", (d) => (buf += d));
    child.on("close", (code) =>
      code === 0 ? res(buf) : rej(new Error(`remote apply exit ${code}`)),
    );
  });

  try {
    const parsed = JSON.parse(out) as Summary;
    return parsed;
  } catch {
    return {
      touched: 0,
      skippedMissing: 0,
      skippedTypeMismatch: 0,
      skippedUnchanged: 0,
      skippedSizeMismatch: 0,
      skippedSymlinkNoLutimes: 0,
      skippedBrokenSymlink: 0,
      errors: 1,
    };
  }
}

function remoteApplyScript(cfg: {
  concurrency: number;
  symlinkMode: "skip" | "link" | "target";
  setAtime: boolean;
  tolerance: number;
  verifySize: boolean;
  dryRun: boolean;
}): string {
  return `
const fsp=require('node:fs').promises;
const fsCb=require('node:fs');
const path=require('node:path');
const hasLutimes=typeof fsCb.lutimes==='function';
const CONC=${cfg.concurrency};
const SYM=${JSON.stringify(cfg.symlinkMode)};
const SETA=${cfg.setAtime ? "true" : "false"};
const TOL=${cfg.tolerance};
const VERIFY=${cfg.verifySize ? "true" : "false"};
const DRY=${cfg.dryRun ? "true" : "false"};

function pLimit(n){
  let active=0, q=[];
  const next=()=>{active--; if(q.length) q.shift()();};
  return (fn)=>new Promise((res,rej)=>{
    const run=()=>{active++; fn().then(v=>{next();res(v);},e=>{next();rej(e);});};
    if(active<n) run(); else q.push(run);
  });
}

(async()=>{
  const limit=pLimit(CONC);
  const root=process.cwd();
  const acc={touched:0,skippedMissing:0,skippedTypeMismatch:0,skippedUnchanged:0,skippedSizeMismatch:0,skippedSymlinkNoLutimes:0,skippedBrokenSymlink:0,errors:0};
  const tasks=[];
  const rd=process.stdin;
  rd.setEncoding('utf8');
  let buf='';
  async function handle(obj){
    const rel=obj.p, t=obj.t, a=obj.a, k=obj.k, s=obj.s;
    const dst=path.join(root,rel);
    const st=await fsp.lstat(dst).catch(()=>null);
    if(!st){ acc.skippedMissing++; return; }

    let current=+st.mtime;
    let at=SETA ? new Date(a) : st.atime;

    if(k==='l'){
      if(!st.isSymbolicLink()){ acc.skippedTypeMismatch++; return; }
      if(SYM==='skip'){ return; }
      if(SYM==='link'){
        if(!hasLutimes){ acc.skippedSymlinkNoLutimes++; return; }
      } else if(SYM==='target'){
        try {
          const tstat=await fsp.stat(dst);
          current=+tstat.mtime;
        } catch {
          acc.skippedBrokenSymlink++; return;
        }
      }
    } else if ((k==='f' && !st.isFile()) || (k==='d' && !st.isDirectory())){
      acc.skippedTypeMismatch++; return;
    } else {
      if(VERIFY && k==='f' && st.size!==s){ acc.skippedSizeMismatch++; return; }
    }

    if(Math.abs(current - t)/1000 <= TOL){ acc.skippedUnchanged++; return; }

    if(DRY){ acc.touched++; return; }

    if(k==='l' && SYM==='link'){
      await new Promise((res,rej)=>fsCb.lutimes(dst, at, new Date(t), (e)=>e?rej(e):res()));
    } else {
      await fsp.utimes(dst, at, new Date(t));
    }
    acc.touched++;
  }

  for await (const chunk of rd){
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i+1);
      if(!line) continue;
      try{ const o=JSON.parse(line); tasks.push(limit(()=>handle(o))); }catch{}
    }
  }
  await Promise.all(tasks).catch(()=>{acc.errors++;});
  process.stdout.write(JSON.stringify(acc));
})().catch(e=>{console.error(String(e)); process.exit(1)});`;
}

/* ------------------------------ Main ------------------------------ */

(async () => {
  const manifest = collectManifest(srcEp);

  const summary =
    dstEp.kind === "local"
      ? await applyToLocal(dstEp.path, manifest)
      : await applyToRemote(dstEp.host, dstEp.path, manifest);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({
        src: SRC,
        dst: DST,
        ...summary,
      }) + "\n",
    );
  } else {
    console.log(
      `\nSummary: touched=${summary.touched} unchanged=${summary.skippedUnchanged} missing=${summary.skippedMissing} typeMismatch=${summary.skippedTypeMismatch} sizeMismatch=${summary.skippedSizeMismatch} symlinkNoLutimes=${summary.skippedSymlinkNoLutimes} brokenSymlink=${summary.skippedBrokenSymlink} errors=${summary.errors}`,
    );
  }
})().catch((e) => {
  if (!opts.json) console.error(e?.stack || String(e));
  process.exit(1);
});
