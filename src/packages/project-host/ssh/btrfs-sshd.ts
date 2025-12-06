import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import getLogger from "@cocalc/backend/logger";
import getPort from "@cocalc/backend/get-port";
import { ensureBtrfsSshKey } from "./btrfs-sshd-key";

const logger = getLogger("project-host:ssh:btrfs-sshd");

export interface BtrfsSshd {
  port: number;
  stop: () => Promise<void>;
  authKeys: string;
}

export async function startBtrfsSshd({
  mount,
  sshpiperdPublicKey,
}: {
  mount: string;
  sshpiperdPublicKey: string;
}): Promise<BtrfsSshd> {
  // Run on the host, not in a container, so btrfs receive has the required
  // privileges and writes directly to the real mount. Access is locked down
  // via a forced command (btrfs receive) plus no-pty/forwarding options.
  const key = ensureBtrfsSshKey();
  const dir = await mkdtemp(join(tmpdir(), "btrfs-sshd-"));
  const hostKeyPath = join(dir, "host_key");
  const authKeysPath = join(dir, "authorized_keys");
  await writeFile(hostKeyPath, key.privateKey, { mode: 0o600 });
  await chmod(hostKeyPath, 0o600);

  // Only sshpiperd connects here; it authenticates with its own key. We still
  // force the command to sudo btrfs receive and disable everything else so the
  // session can only write to the mount and nothing more.
  const keyWithUser = (() => {
    const parts = sshpiperdPublicKey.trim().split(/\s+/);
    const user = process.env.USER ?? "cocalc";
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[1]} ${user}`;
    }
    return sshpiperdPublicKey.trim();
  })();
  const forcedOpts = [
    `command="sudo btrfs receive ${mount}"`,
    "no-pty",
    "no-port-forwarding",
    "no-X11-forwarding",
    "no-agent-forwarding",
    "restrict",
  ].join(",");
  const authKey = `${forcedOpts} ${keyWithUser}`;
  await writeFile(authKeysPath, authKey, { mode: 0o600 });

  const configPath = join(dir, "sshd_config");
  const port = await getPort();
  const config = `
Port ${port}
ListenAddress 127.0.0.1
HostKey ${hostKeyPath}
AuthorizedKeysFile ${authKeysPath}
PasswordAuthentication no
PermitTTY no
PermitUserEnvironment no
PermitTunnel no
AllowTcpForwarding no
AllowAgentForwarding no
X11Forwarding no
ClientAliveInterval 30
UsePAM no
Subsystem sftp internal-sftp
`;
  await writeFile(configPath, config);

  const child: ChildProcessWithoutNullStreams = spawn("/usr/sbin/sshd", [
    "-D",
    "-f",
    configPath,
  ]);
  child.stdout.on("data", (d) => logger.debug(d.toString()));
  child.stderr.on("data", (d) => logger.debug(d.toString()));

  // Wait for sshd to accept connections; fail fast if it exits.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("btrfs sshd startup timeout")), 3000);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      reject(
        new Error(
          `btrfs sshd exited during startup (${code !== null ? `code ${code}` : signal ?? "unknown"})`,
        ),
      );
    };
    child.once("exit", onExit);
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    const net = require("net");
    const tryConnect = () => {
      const sock = net.createConnection({ host: "127.0.0.1", port }, () => {
        clearTimeout(timer);
        sock.destroy();
        child.off("exit", onExit);
        resolve();
      });
      sock.on("error", () => {
        setTimeout(tryConnect, 100);
      });
    };
    tryConnect();
  });

  const stop = async () => {
    child.kill("SIGTERM");
    await rm(dir, { recursive: true, force: true });
  };

  return { port, stop, authKeys: authKey };
}
