import { randomUUID } from "node:crypto";

export type AcpStreamUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

export type AcpThinkingEvent = {
  type: "thinking";
  text: string;
};

export type AcpMessageEvent = {
  type: "message";
  text: string;
};

export type AcpStreamEvent = AcpThinkingEvent | AcpMessageEvent;

export type AcpStreamPayload =
  | {
      type: "event";
      event: AcpStreamEvent;
    }
  | {
    type: "summary";
    finalResponse: string;
    usage?: AcpStreamUsage | null;
    threadId?: string | null;
  };

export type AcpStreamHandler = (
  payload?: AcpStreamPayload | null,
) => Promise<void>;

export interface AcpEvaluateRequest {
  account_id: string;
  prompt: string;
  session_id?: string;
  stream: AcpStreamHandler;
}

export interface AcpAgent {
  evaluate(request: AcpEvaluateRequest): Promise<void>;
}

/**
 * EchoAgent is a placeholder implementation that mimics an ACP agent.
 * It emits a short thinking event and a summary containing the user's prompt.
 */
export class EchoAgent implements AcpAgent {
  async evaluate({
    prompt,
    stream,
  }: AcpEvaluateRequest): Promise<void> {
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

export const echoAgent = new EchoAgent();
