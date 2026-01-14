/*
Tool registry helpers for the control-plane agent.
*/

import type { ControlAgentCapabilities } from "./types";
import {
  CONTROL_AGENT_TOOL_DEFINITIONS,
  type ControlAgentToolDefinition,
  type ControlAgentToolName,
} from "./tools";

const TOOL_CAPABILITY_MAP: Partial<
  Record<ControlAgentToolName, keyof ControlAgentCapabilities>
> = {
  "workspace.list": "supportsWorkspaces",
  "workspace.create": "supportsWorkspaces",
  "workspace.rename": "supportsWorkspaces",
  "workspace.archive": "supportsWorkspaces",
  "workspace.delete": "supportsWorkspaces",
  "workspace.add_collaborator": "supportsCollaborators",
  "workspace.remove_collaborator": "supportsCollaborators",
  "workspace.tag": "supportsOrganization",
  "logs.search": "supportsLogs",
  "config.get": "supportsConfig",
  "config.set": "supportsConfig",
  "sync.configure": "supportsRemoteSync",
  handoff_to_workspace_agent: "supportsHandoff",
  "host.start": "supportsWorkspaces",
};

export function getControlAgentToolDefinition(
  name: ControlAgentToolName,
): ControlAgentToolDefinition | undefined {
  return CONTROL_AGENT_TOOL_DEFINITIONS[name];
}

export function listControlAgentTools(options?: {
  capabilities?: ControlAgentCapabilities;
  availableTools?: Iterable<ControlAgentToolName>;
}): ControlAgentToolDefinition[] {
  const capabilities = options?.capabilities;
  const available =
    options?.availableTools != null
      ? new Set(options.availableTools)
      : undefined;
  return Object.values(CONTROL_AGENT_TOOL_DEFINITIONS).filter((tool) => {
    if (available && !available.has(tool.name)) {
      return false;
    }
    const capability = TOOL_CAPABILITY_MAP[tool.name];
    if (!capability || !capabilities) {
      return true;
    }
    return !!capabilities[capability];
  });
}
