import type { CodexSessionConfig } from "@cocalc/util/ai/codex";
import type { LineDiffResult } from "@cocalc/util/line-diff";

export interface AcpChatContext {
  project_id: string;
  path: string;
  message_date: string;
  sender_id: string;
  reply_to?: string;
}

export type AcpRequest = {
  project_id: string;
  account_id: string;
  prompt: string;
  session_id?: string;
  config?: CodexSessionConfig;
  chat?: AcpChatContext;
};

export type AcpApprovalDecisionRequest = {
  project_id: string;
  account_id: string;
  approvalId: string;
  optionId?: string;
  note?: string;
};

export type AcpInterruptRequest = {
  project_id: string;
  account_id: string;
  threadId?: string;
  chat?: AcpChatContext;
  note?: string;
};

export type AcpForkSessionRequest = {
  project_id: string;
  account_id: string;
  sessionId: string;
  newSessionId?: string;
};

export type AcpStreamUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
  model_context_window?: number;
};

export type AcpApprovalOptionKind =
  | "allow_once"
  | "allow_always"
  | "reject_once"
  | "reject_always";

export type AcpApprovalStatus =
  | "pending"
  | "selected"
  | "cancelled"
  | "timeout";

export type AcpStreamEvent =
  | {
      type: "thinking";
      text: string;
    }
  | {
      type: "message";
      text: string;
    }
  | {
      type: "diff";
      path: string;
      diff: LineDiffResult;
    }
  | {
      type: "file";
      path: string;
      operation: "read" | "write";
      bytes?: number;
      truncated?: boolean;
      line?: number;
      limit?: number;
      existed?: boolean;
    }
  | {
      type: "terminal";
      terminalId: string;
      phase: "start" | "data" | "exit";
      command?: string;
      args?: string[];
      cwd?: string;
      chunk?: string;
      truncated?: boolean;
      exitStatus?: {
        exitCode?: number;
        signal?: string;
      };
      output?: string;
    }
  | {
      type: "approval";
      approvalId: string;
      status: AcpApprovalStatus;
      title?: string | null;
      description?: string | null;
      requestedAt: string;
      decidedAt?: string;
      decidedBy?: string;
      note?: string;
      timeoutAt?: string;
      toolCallId?: string;
      toolKind?: string | null;
      options: {
        optionId: string;
        name: string;
        kind: AcpApprovalOptionKind;
      }[];
      selectedOptionId?: string;
    };

export type AcpStreamPayload =
  | { type: "status"; state: "init" | "running" }
  | {
      type: "event";
      event: AcpStreamEvent;
    }
  | {
      type: "usage";
      usage: AcpStreamUsage;
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
