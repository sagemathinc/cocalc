import { authFirstRequireAccount } from "./util";

export const controlAgent = {
  controlAgentDev: authFirstRequireAccount,
};

export type ControlAgentTranscriptItem = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  name?: string;
  callId?: string;
};

export type ControlAgentDevRequest = {
  message: string;
  maxTurns?: number;
  model?: string;
  dryRun?: boolean;
};

export type ControlAgentDevResponse = {
  transcript: ControlAgentTranscriptItem[];
  finalOutput?: unknown;
  lastResponseId?: string;
};

export interface ControlAgent {
  controlAgentDev: (
    opts: ControlAgentDevRequest & { account_id?: string },
  ) => Promise<ControlAgentDevResponse>;
}
