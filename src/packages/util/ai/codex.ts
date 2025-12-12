export interface CodexReasoningLevel {
  id: "low" | "medium" | "high" | "extra_high";
  label: string;
  description: string;
  default?: boolean;
}

export interface CodexModelInfo {
  name: string;
  description?: string;
  reasoning?: CodexReasoningLevel[];
}

export type CodexReasoningId = CodexReasoningLevel["id"];

export type CodexSessionMode = "auto" | "read-only" | "full-access";

export interface CodexSessionConfig {
  workingDirectory?: string;
  sessionId?: string;
  model?: string;
  reasoning?: CodexReasoningId;
  allowWrite?: boolean;
  sessionMode?: CodexSessionMode;
  env?: Record<string, string>;
  codexPathOverride?: string;
}

export function resolveCodexSessionMode(
  config?: CodexSessionConfig,
): CodexSessionMode {
  const mode = config?.sessionMode;
  if (mode === "auto" || mode === "read-only" || mode === "full-access") {
    return mode;
  }
  if (typeof config?.allowWrite === "boolean") {
    return config.allowWrite ? "auto" : "read-only";
  }
  return "auto";
}

export const DEFAULT_CODEX_MODELS: CodexModelInfo[] = [
  {
    name: "gpt-5.1-codex-max",
    description: "Latest Codex-optimized flagship for deep and fast reasoning.",
    reasoning: [
      {
        id: "low",
        label: "Low",
        description: "Fastest responses with limited reasoning.",
      },
      {
        id: "medium",
        label: "Medium",
        description:
          "Balanced speed and depth; dynamically adjusts to the task.",
        default: true,
      },
      {
        id: "high",
        label: "High",
        description:
          "Maximizes reasoning depth for complex or ambiguous problems.",
      },
      {
        id: "extra_high",
        label: "Extra high",
        description: "Highest depth for especially challenging tasks.",
      },
    ],
  },
  {
    name: "gpt-5.1-codex",
    description: "Optimized for Codex.",
    reasoning: [
      {
        id: "low",
        label: "Low",
        description: "Fastest responses with limited reasoning.",
      },
      {
        id: "medium",
        label: "Medium",
        description: "Dynamically adjusts reasoning based on the task.",
        default: true,
      },
      {
        id: "high",
        label: "High",
        description: "Maximizes reasoning depth for complex problems.",
      },
    ],
  },
  {
    name: "gpt-5.1-codex-mini",
    description: "Optimized for Codex. Cheaper and faster.",
    reasoning: [
      {
        id: "medium",
        label: "Medium",
        description: "Dynamically adjusts reasoning based on the task.",
        default: true,
      },
      {
        id: "high",
        label: "High",
        description:
          "Maximizes reasoning depth for complex or ambiguous problems.",
      },
    ],
  },
  {
    name: "gpt-5.1",
    description: "Broad world knowledge with strong general reasoning.",
    reasoning: [
      {
        id: "low",
        label: "Low",
        description:
          "Balances speed with some reasoning; useful for straightforward queries and short explanations.",
      },
      {
        id: "medium",
        label: "Medium",
        description:
          "Provides a solid balance of reasoning depth and latency for general-purpose tasks.",
        default: true,
      },
      {
        id: "high",
        label: "High",
        description:
          "Maximizes reasoning depth for complex or ambiguous problems.",
      },
    ],
  },
];
