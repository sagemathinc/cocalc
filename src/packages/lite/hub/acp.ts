import getLogger from "@cocalc/backend/logger";
import { CodexAcpAgent, EchoAgent, type AcpAgent } from "@cocalc/ai/acp";
import { init as initConatAcp } from "@cocalc/conat/ai/acp/server";
import type { AcpRequest, AcpStreamPayload } from "@cocalc/conat/ai/acp/types";

const logger = getLogger("lite:hub:acp");

let agent: AcpAgent | null = null;

async function ensureAgent(): Promise<AcpAgent> {
  if (agent != null) return agent;
  const mode = process.env.COCALC_ACP_MODE;
  logger.debug("ensureAgent", { mode });
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
  await currentAgent.evaluate({
    ...request,
    stream,
  });
}

export async function init(): Promise<void> {
  logger.debug("initializing acp conat server");
  process.once("exit", () => {
    agent?.dispose?.().catch((err) => {
      logger.warn("failed to dispose ACP agent", err);
    });
  });
  await initConatAcp(evaluate);
}
