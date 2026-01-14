/*
Control-agent adapter factory for the full hub.
*/

import type {
  ControlAgentAdapter,
  ControlAgentCapabilities,
  ControlAgentContext,
} from "@cocalc/ai/control-agent";
import { createInMemoryControlAgentAdapter } from "@cocalc/ai/control-agent";
import { createFullControlAgentToolAdapter } from "./tool-adapter";

const DEFAULT_CAPABILITIES: ControlAgentCapabilities = {
  supportsWorkspaces: true,
  supportsCollaborators: true,
  supportsOrganization: true,
  supportsLogs: false,
  supportsConfig: false,
  supportsRemoteSync: false,
  supportsHandoff: true,
};

export function createFullControlAgentAdapter(options: {
  context: ControlAgentContext;
  capabilities?: Partial<ControlAgentCapabilities>;
}): ControlAgentAdapter {
  const capabilities = { ...DEFAULT_CAPABILITIES, ...options.capabilities };
  return createInMemoryControlAgentAdapter({
    context: options.context,
    capabilities,
    tools: createFullControlAgentToolAdapter(),
  });
}
