import type { CodexSessionConfig } from "@cocalc/util/ai/codex";

export type AcpRequest = {
  account_id: string;
  prompt: string;
  session_id?: string;
  config?: CodexSessionConfig;
};

export type AcpStreamUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

export type AcpStreamEvent =
  | {
      type: "thinking";
      text: string;
    }
  | {
      type: "message";
      text: string;
    };

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
    }
  | {
      type: "error";
      error: string;
    };

export type AcpStreamMessage = AcpStreamPayload & { seq: number };
