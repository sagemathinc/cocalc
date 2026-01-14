/*
Control-agent runner factory for CoCalc+Plus (lite hub).
*/

import type {
  ControlAgentCapabilities,
  ControlAgentContext,
} from "@cocalc/ai/control-agent";
import { createControlAgentRunner } from "@cocalc/ai/control-agent";
import { createLiteControlAgentAdapter } from "./adapter";

export function createLiteControlAgentRunner(options: {
  context: ControlAgentContext;
  capabilities?: Partial<ControlAgentCapabilities>;
}) {
  const adapter = createLiteControlAgentAdapter(options);
  return createControlAgentRunner(adapter);
}
