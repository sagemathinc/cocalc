/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Re-exports from the agent registry for backward compatibility.
// The single source of truth is agent-registry.ts.
export { hasEmbeddedAgent, getAgentSpec } from "./agent-registry";
export type { AgentSpec, NoAgentSpec, AgentComponent } from "./agent-registry";
