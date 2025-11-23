import path from "node:path";
import { URL } from "node:url";
import getLogger from "@cocalc/backend/logger";
import {
  CodexAcpAgent,
  EchoAgent,
  type AcpAgent,
  type CustomCommandHandler,
} from "@cocalc/ai/acp";
import { init as initConatAcp } from "@cocalc/conat/ai/acp/server";
import type { AcpRequest, AcpStreamPayload } from "@cocalc/conat/ai/acp/types";
import type { CodexSessionConfig } from "@cocalc/util/ai/codex";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { getBlobstore } from "./blobs/download";
import { type AKV } from "@cocalc/conat/sync/akv";

const logger = getLogger("lite:hub:acp");

const BLOB_COMMAND = "cocalc-get-blob";

let blobStore: AKV | null = null;
let agent: AcpAgent | null = null;

async function ensureAgent(): Promise<AcpAgent> {
  if (agent != null) return agent;
  const mode = process.env.COCALC_ACP_MODE;
  logger.debug("ensureAgent", { mode });
  const sessionsDir =
    process.env.COCALC_ACP_SESSIONS_DIR ??
    path.join(process.cwd(), "data/codex-sessions");
  if (mode === "echo") {
    logger.debug("ensureAgent: creating echo agent");
    agent = new EchoAgent();
    return agent;
  }
  try {
    logger.debug("ensureAgent: creating codex acp agent");
    agent = await CodexAcpAgent.create({
      binaryPath: process.env.COCALC_ACP_AGENT_BIN,
      cwd: process.cwd(),
      sessionPersistPath: sessionsDir,
      commandHandlers: {
        [BLOB_COMMAND]: blobCommandHandler,
      },
    });
    logger.info("codex-acp agent ready");
  } catch (err) {
    logger.error("failed to start codex-acp, falling back to echo agent", err);
    agent = new EchoAgent();
  }
  return agent!;
}

export async function evaluate({
  stream,
  ...request
}: AcpRequest & {
  stream: (payload?: AcpStreamPayload | null) => Promise<void>;
}): Promise<void> {
  const currentAgent = await ensureAgent();
  const config = normalizeConfig(request.config);
  await currentAgent.evaluate({
    ...request,
    config,
    stream,
  });
}

export async function init(client: ConatClient): Promise<void> {
  logger.debug("initializing acp conat server");
  process.once("exit", () => {
    agent?.dispose?.().catch((err) => {
      logger.warn("failed to dispose ACP agent", err);
    });
  });
  blobStore = getBlobstore(client);
  await initConatAcp(evaluate, client);
}

function normalizeConfig(
  config?: CodexSessionConfig,
): CodexSessionConfig | undefined {
  if (config == null) return;
  const normalized: CodexSessionConfig = { ...config };
  if (config.workingDirectory) {
    normalized.workingDirectory = path.resolve(config.workingDirectory);
  }
  return normalized;
}

const blobCommandHandler: CustomCommandHandler = async ({ args = [] }) => {
  const target = args[0];
  if (!target) {
    return {
      output: `Usage: ${BLOB_COMMAND} <blob-url>\n`,
      exitCode: 64,
    };
  }
  const info = parseBlobReference(target);
  const store = blobStore;
  if (store == null) {
    throw new Error("Blob store is not initialized");
  }
  const data = await store.get(info.uuid);
  if (data == null) {
    return {
      output: `Blob ${info.uuid} not found\n`,
      exitCode: 1,
    };
  }
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const header = `cocalc-get-blob: ${info.label ?? info.uuid} (${buffer.length} bytes)\n`;
  const base64 = buffer.toString("base64");
  const output = (function* (): Iterable<string> {
    yield header;
    yield* chunkString(base64, 4096);
    yield "\n";
  })();
  return {
    output,
  };
};

function parseBlobReference(target: string): { uuid: string; label?: string } {
  const trimmed = target.trim();
  if (!trimmed) {
    throw new Error("Missing blob reference");
  }
  try {
    const url = new URL(
      trimmed,
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? undefined
        : "http://placeholder",
    );
    if (url.pathname.includes("/blobs/")) {
      const uuid = url.searchParams.get("uuid") ?? trimmed;
      const label = path.basename(url.pathname);
      return {
        uuid,
        label,
      };
    }
  } catch {
    // ignore
  }
  if (trimmed.includes("uuid=")) {
    const uuid = trimmed.slice(trimmed.indexOf("uuid=") + 5);
    return { uuid };
  }
  return { uuid: trimmed };
}

function* chunkString(text: string, size = 4096): Iterable<string> {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
  }
}
