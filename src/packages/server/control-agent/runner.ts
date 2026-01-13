/*
Control-agent runner factory for the full hub.
*/

import type {
  ControlAgentCapabilities,
  ControlAgentContext,
} from "@cocalc/ai/control-agent";
import { createControlAgentRunner } from "@cocalc/ai/control-agent";
import { createFullControlAgentAdapter } from "./adapter";

export function createFullControlAgentRunner(options: {
  context: ControlAgentContext;
  capabilities?: Partial<ControlAgentCapabilities>;
}) {
  const adapter = createFullControlAgentAdapter(options);
  return createControlAgentRunner(adapter);
}
