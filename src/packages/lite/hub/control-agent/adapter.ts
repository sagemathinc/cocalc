/*
Control-agent adapter factory for CoCalc+Plus (lite hub).
*/

import type {
  ControlAgentAdapter,
  ControlAgentCapabilities,
  ControlAgentContext,
} from "@cocalc/ai/control-agent";
import { createInMemoryControlAgentAdapter } from "@cocalc/ai/control-agent";
import { createLiteControlAgentToolAdapter } from "./tool-adapter";

const DEFAULT_CAPABILITIES: ControlAgentCapabilities = {
  supportsWorkspaces: false,
  supportsCollaborators: false,
  supportsOrganization: false,
  supportsLogs: true,
  supportsConfig: true,
  supportsRemoteSync: true,
  supportsHandoff: true,
};

export function createLiteControlAgentAdapter(options: {
  context: ControlAgentContext;
  capabilities?: Partial<ControlAgentCapabilities>;
}): ControlAgentAdapter {
  const capabilities = { ...DEFAULT_CAPABILITIES, ...options.capabilities };
  return createInMemoryControlAgentAdapter({
    context: options.context,
    capabilities,
    tools: createLiteControlAgentToolAdapter(),
  });
}
