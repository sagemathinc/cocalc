/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Barrel export for the shared agent base.
export { AgentError } from "./agent-error";
export { AgentErrorBoundary } from "./agent-error-boundary";
export { AgentHeader } from "./agent-header";
export { AgentInputArea } from "./agent-input-area";
export { AgentMessages } from "./agent-messages";
export { AgentSessionBar } from "./agent-session-bar";
export type { AgentSession, DisplayMessage, WriteMessageParams } from "./types";
export {
  agentSenderId,
  ASSISTANT_MSG_STYLE,
  CONTAINER_STYLE,
  ERROR_MSG_STYLE,
  INPUT_AREA_STYLE,
  MESSAGES_STYLE,
  SYNCDB_CHANGE_THROTTLE,
  SYSTEM_MSG_STYLE,
  USER_MSG_STYLE,
} from "./types";
export { PendingExecBar } from "./pending-exec-bar";
export type { PendingExecBarProps } from "./pending-exec-bar";
export { RenameModal } from "./rename-modal";
export { useAgentSession } from "./use-agent-session";
export type { UseAgentSessionOptions } from "./use-agent-session";
export { useAutoNameSession } from "./use-auto-name-session";
export { useCostEstimate } from "./use-cost-estimate";
