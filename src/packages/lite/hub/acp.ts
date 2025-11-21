import getLogger from "@cocalc/backend/logger";
import { echoAgent } from "@cocalc/ai/acp";
import { init as initConatAcp } from "@cocalc/conat/ai/acp/server";
import type {
  AcpRequest,
  AcpStreamPayload,
} from "@cocalc/conat/ai/acp/types";

const logger = getLogger("lite:hub:acp");

export async function evaluate({
  stream,
  ...request
}: AcpRequest & {
  stream: (payload?: AcpStreamPayload | null) => Promise<void>;
}): Promise<void> {
  logger.debug("acp evaluate", { prompt: request.prompt });
  await echoAgent.evaluate({
    ...request,
    stream,
  });
}

export async function init(): Promise<void> {
  logger.debug("initializing acp conat server");
  await initConatAcp(evaluate);
}
