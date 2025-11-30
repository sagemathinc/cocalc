import type { AcpAgent, AcpEvaluateRequest } from "./types";

/**
 * EchoAgent is a placeholder implementation that mimics an ACP agent.
 * It emits a short thinking event and a summary containing the user's prompt.
 */
export class EchoAgent implements AcpAgent {
  async evaluate({ prompt, stream }: AcpEvaluateRequest): Promise<void> {
    await stream({
      type: "event",
      event: {
        type: "thinking",
        text: "Analyzing prompt…",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    await stream({
      type: "event",
      event: {
        type: "message",
        text: "Generating response…",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    await stream({
      type: "summary",
      finalResponse: `ACP Echo: ${prompt}`,
      usage: {
        input_tokens: prompt.length,
        output_tokens: prompt.length + 10,
      },
      threadId: randomUUID(),
    });
  }
}

import { randomUUID } from "node:crypto";

export const echoAgent = new EchoAgent();
