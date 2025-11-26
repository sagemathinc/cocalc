import {
  Button,
  Form,
  Input,
  Modal,
  Space,
  Typography,
  Select,
  Radio,
  Progress,
  Collapse,
  Divider,
  Tooltip,
} from "antd";
import {
  React,
  useEffect,
  useMemo,
  useState,
} from "@cocalc/frontend/app-framework";
import {
  DEFAULT_CODEX_MODELS,
  resolveCodexSessionMode,
  type CodexReasoningLevel,
  type CodexSessionMode,
} from "@cocalc/util/ai/codex";
import { COLORS } from "@cocalc/util/theme";
import type { ChatMessageTyped } from "./types";
import { toMsString } from "./utils";
import type { ChatActions } from "./actions";

const { Text } = Typography;
const DEFAULT_MODEL_NAME = DEFAULT_CODEX_MODELS[0].name;

// for testing
//export const CONTEXT_WARN_PCT = 85;
//export const CONTEXT_CRITICAL_PCT = 90;
export const CONTEXT_WARN_PCT = 30;
export const CONTEXT_CRITICAL_PCT = 15;

type ModeOption = {
  value: CodexSessionMode;
  label: string;
  description: string;
  warning?: boolean;
};

const MODE_OPTIONS: ModeOption[] = [
  {
    value: "full-access",
    label: "Full access",
    description:
      "Run commands with network access and edit files outside this workspace. Extremely powerful—use with caution.",
    warning: true,
  },
  {
    value: "auto",
    label: "Sandboxed",
    description:
      "Codex can run commands and edit files inside this workspace. Approvals may be requested for certain operations.",
  },
  {
    value: "read-only",
    label: "Read only",
    description: "Inspect files safely. Commands and edits require approval.",
  },
];

export interface CodexConfigButtonProps {
  threadKey: string;
  chatPath: string;
  actions?: ChatActions;
}

type ModelOption = {
  value: string;
  label: string;
  thinking?: string;
  description?: string;
  reasoning?: CodexReasoningLevel[];
};

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text strong style={{ color: COLORS.GRAY_D }}>
    {children}
  </Text>
);

const formItemStyle = { marginBottom: 12 } as const;
const gridTwoColStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  width: "100%",
} as const;

export function CodexConfigButton({
  threadKey,
  chatPath,
  actions,
}: CodexConfigButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [models, setModels] = useState<ModelOption[]>([]);

  useEffect(() => {
    const initialModels = DEFAULT_CODEX_MODELS.map((m) => ({
      value: m.name,
      label: m.name,
      thinking: m.reasoning?.find((r) => r.default)?.label,
      description: m.description,
      reasoning: m.reasoning,
    }));
    setModels(initialModels);
  }, []);

  useEffect(() => {
    if (!models.length || !open) return;
    const baseModel = models[0]?.value ?? DEFAULT_MODEL_NAME;
    const baseReasoning = getReasoningForModel({
      models,
      modelValue: baseModel,
    });
    const defaults = {
      workingDirectory: defaultWorkingDir(chatPath),
      sessionId: "",
      model: baseModel,
      reasoning: baseReasoning,
      envHome: "",
      envPath: "",
      sessionMode: "auto" as CodexSessionMode,
    };
    const ms = parseInt(threadKey, 10);
    const saved =
      !Number.isNaN(ms) && actions?.getCodexConfig
        ? actions.getCodexConfig(new Date(ms))
        : undefined;
    const merged = { ...defaults, ...(saved ?? {}) };
    const model = models.some((m) => m.value === merged.model)
      ? merged.model
      : baseModel;
    const reasoning = getReasoningForModel({
      models,
      modelValue: model,
      desired: merged.reasoning,
    });
    const sessionMode = resolveCodexSessionMode(merged);
    form.resetFields();
    form.setFieldsValue({
      ...merged,
      model,
      reasoning,
      sessionMode,
    });
  }, [models, threadKey, chatPath, actions, form, open]);

  const selectedModelValue = Form.useWatch("model", form);
  const selectedReasoningValue = Form.useWatch("reasoning", form);
  const currentSessionMode = Form.useWatch("sessionMode", form);
  const messageMap = actions?.store?.get("messages");
  const usageSummary = useMemo(() => {
    return getCodexUsageSummary(threadKey, actions, messageMap);
  }, [threadKey, actions, messageMap]);
  const reasoningOptions = useMemo(() => {
    const selected =
      models.find((m) => m.value === selectedModelValue) ?? models[0];
    return (
      selected?.reasoning?.map((r) => ({
        value: r.id,
        label: r.label,
        description: r.description,
        default: r.default,
      })) ?? []
    );
  }, [models, selectedModelValue]);

  const onSave = () => {
    const values = form.getFieldsValue();
    const sessionMode: CodexSessionMode =
      values.sessionMode ?? resolveCodexSessionMode(values);
    const finalValues = {
      ...values,
      sessionMode,
      allowWrite: sessionMode !== "read-only",
    };
    actions?.setCodexConfig?.(threadKey, finalValues);
    setOpen(false);
  };

  const selectedModelLabel =
    models.find((m) => m.value === selectedModelValue)?.label ??
    DEFAULT_MODEL_NAME;
  const selectedReasoningLabel =
    reasoningOptions.find((r) => r.value === selectedReasoningValue)?.label ??
    "";

  const contextWindow =
    usageSummary?.contextWindow ?? getModelContextWindow(selectedModelValue);
  const usedTokens =
    usageSummary?.usedTokens ??
    (usageSummary?.totalTokens != null ? usageSummary.totalTokens : 0);
  const cappedUsedTokens =
    contextWindow != null ? Math.min(usedTokens, contextWindow) : usedTokens;
  const remainingPercent =
    usageSummary != null && contextWindow != null
      ? Math.max(
          0,
          Math.round(
            ((contextWindow - cappedUsedTokens) / contextWindow) * 100,
          ),
        )
      : null;

  const contextSummary =
    remainingPercent != null ? `${remainingPercent}% context left` : null;
  const contextSeverity =
    remainingPercent == null
      ? "unknown"
      : remainingPercent < 100 - CONTEXT_CRITICAL_PCT
        ? "critical"
        : remainingPercent < 100 - CONTEXT_WARN_PCT
          ? "warning"
          : "ok";
  const contextColors = {
    ok: {
      text: COLORS.GRAY_M,
      accent: COLORS.BLUE,
      bg: "transparent",
      border: COLORS.GRAY_L,
    },
    warning: {
      text: "#b26a00",
      accent: "#f5a623",
      bg: "rgba(245, 166, 35, 0.12)",
      border: "rgba(245, 166, 35, 0.4)",
    },
    critical: {
      text: COLORS.FG_RED,
      accent: "#d32f2f",
      bg: "rgba(211, 47, 47, 0.12)",
      border: "rgba(211, 47, 47, 0.4)",
    },
    unknown: {
      text: COLORS.GRAY_M,
      accent: COLORS.GRAY_M,
      bg: "transparent",
      border: COLORS.GRAY_L,
    },
  }[contextSeverity];
  const contextLabel =
    contextSeverity === "critical"
      ? "Context very low — compact now"
      : contextSeverity === "warning"
        ? "Context low — compact soon"
        : (contextSummary ?? "Context");
  const contextSubtitleColor =
    contextSeverity === "critical"
      ? COLORS.FG_RED
      : contextSeverity === "warning"
        ? "#b26a00"
        : COLORS.GRAY;

  const contextMeter =
    remainingPercent != null ? (
      <div
        style={{
          border: `1px solid ${contextColors.border}`,
          borderRadius: 6,
          padding: 10,
          background: contextColors.bg,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Space size={8} align="center">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: contextColors.accent,
                boxShadow:
                  contextSeverity === "ok"
                    ? undefined
                    : `0 0 0 6px ${contextColors.bg}`,
                flexShrink: 0,
              }}
            />
            <Tooltip title="Context tracks how much of the model window remains before quality drops. Compact to reclaim space.">
              <Text
                style={{
                  fontSize: 12,
                  color: contextColors.text,
                  fontWeight:
                    contextSeverity === "ok" || contextSeverity === "unknown"
                      ? 500
                      : 600,
                }}
              >
                {contextLabel}
                {contextSummary ? ` (${contextSummary})` : ""}
              </Text>
            </Tooltip>
          </Space>
          {actions?.runCodexCompact ? (
            <Button
              size="small"
              onClick={() => actions?.runCodexCompact?.(threadKey)}
              type={contextSeverity === "ok" ? "default" : "primary"}
              danger={contextSeverity === "critical"}
            >
              Compact
            </Button>
          ) : null}
        </div>
        <Progress
          percent={100 - remainingPercent}
          status={
            contextSeverity === "critical"
              ? "exception"
              : contextSeverity === "warning"
                ? "active"
                : "normal"
          }
          strokeColor={
            contextSeverity === "critical"
              ? contextColors.accent
              : contextSeverity === "warning"
                ? contextColors.accent
                : undefined
          }
          showInfo={false}
          size="small"
        />
      </div>
    ) : null;

  const modeLabel = (() => {
    const mode = resolveCodexSessionMode({ sessionMode: currentSessionMode });
    switch (mode) {
      case "read-only":
        return "Codex Read Only";
      case "full-access":
        return "Codex Full Access";
      case "auto":
      default:
        return "Codex Sandboxed";
    }
  })();

  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        {modeLabel}
        <div
          style={{
            fontSize: 11,
            color: contextSubtitleColor,
          }}
        >
          {selectedModelLabel}
          {selectedReasoningLabel ? ` · ${selectedReasoningLabel}` : ""}
          {contextSummary ? ` · ${contextSummary}` : ""}
        </div>
      </Button>
      <Modal
        open={open}
        title="Codex Session Configuration"
        okText="Save"
        onOk={onSave}
        onCancel={() => setOpen(false)}
        width={560}
        bodyStyle={{ maxHeight: "75vh", overflowY: "auto" }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          {contextMeter}
          <Form form={form} layout="vertical">
            <SectionTitle>Session basics</SectionTitle>
            <div style={gridTwoColStyle}>
              <Form.Item
                label="Working directory"
                name="workingDirectory"
                style={formItemStyle}
              >
                <Input
                  placeholder="Defaults to the directory containing this chat"
                  allowClear
                />
              </Form.Item>
              <Form.Item
                label="Session ID"
                name="sessionId"
                tooltip="Optional. Reuse a Codex session to keep continuity."
                style={formItemStyle}
              >
                <Input
                  placeholder="Leave blank to create a new session"
                  allowClear
                />
              </Form.Item>
            </div>
            <div style={gridTwoColStyle}>
              <Form.Item label="Model" name="model" style={formItemStyle}>
                <Select
                  placeholder="e.g., gpt-5.1-codex-max"
                  options={models}
                  optionRender={(option) =>
                    renderOptionWithDescription({
                      title: `${option.data.label}${
                        option.data.value === selectedModelValue &&
                        selectedReasoningLabel
                          ? ` (${selectedReasoningLabel})`
                          : option.data.thinking
                            ? ` (${option.data.thinking})`
                            : ""
                      }`,
                      description: option.data.description,
                    })
                  }
                  showSearch
                  allowClear
                  onChange={(val) => {
                    const selected = models.find((m) => m.value === val);
                    if (selected?.reasoning?.length) {
                      const def =
                        selected.reasoning.find((r) => r.default)?.id ??
                        selected.reasoning[0]?.id;
                      form.setFieldsValue({ reasoning: def });
                    }
                  }}
                />
              </Form.Item>
              <Form.Item
                label="Reasoning level"
                name="reasoning"
                style={formItemStyle}
              >
                <Select
                  placeholder="Select reasoning"
                  options={reasoningOptions}
                  optionRender={(option) =>
                    renderOptionWithDescription({
                      title: `${option.data.label}${
                        option.data.default ? " (default)" : ""
                      }`,
                      description: option.data.description,
                    })
                  }
                />
              </Form.Item>
            </div>
            <Divider style={{ margin: "12px 0" }} />
            <SectionTitle>Advanced options</SectionTitle>
            <Collapse size="small" bordered={false}>
              <Collapse.Panel
                header="Environment overrides"
                key="env"
                style={{ border: "none" }}
              >
                <Form.Item
                  label="HOME override"
                  name="envHome"
                  tooltip="Optional. Overrides HOME for the Codex CLI."
                  extra="Useful if Codex needs a different HOME than this notebook."
                  style={formItemStyle}
                >
                  <Input placeholder="Use logged-in Codex HOME if needed" />
                </Form.Item>
                <Form.Item
                  label="PATH override"
                  name="envPath"
                  tooltip="Optional. Ensures the codex CLI is on PATH."
                  extra="Provide a PATH string containing the codex binary."
                  style={formItemStyle}
                >
                  <Input placeholder="Custom PATH for codex binary" />
                </Form.Item>
              </Collapse.Panel>
            </Collapse>
            <Divider style={{ margin: "12px 0" }} />
            <Form.Item
              label="Execution mode"
              name="sessionMode"
              tooltip="Control how much access Codex has inside your project."
              style={formItemStyle}
            >
              <Radio.Group style={{ width: "100%" }}>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  {MODE_OPTIONS.map((option) => {
                    const selected = currentSessionMode === option.value;
                    return (
                      <div
                        key={option.value}
                        style={{
                          border: `1px solid ${
                            selected ? COLORS.BLUE : COLORS.GRAY_L
                          }`,
                          borderRadius: 8,
                          padding: 10,
                          background: selected ? COLORS.GRAY_LL : undefined,
                        }}
                      >
                        <Radio value={option.value} style={{ width: "100%" }}>
                          <div>
                            <strong
                              style={{
                                color: option.warning
                                  ? COLORS.FG_RED
                                  : COLORS.GRAY_D,
                              }}
                            >
                              {option.label}
                            </strong>
                            <div
                              style={{
                                fontSize: 12,
                                color: option.warning
                                  ? COLORS.FG_RED
                                  : COLORS.GRAY_M,
                              }}
                            >
                              {option.description}
                            </div>
                          </div>
                        </Radio>
                      </div>
                    );
                  })}
                </Space>
              </Radio.Group>
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </>
  );
}

export default CodexConfigButton;

type UsageSummary = {
  latest?: any;
  totalTokens: number;
  usedTokens?: number;
  contextWindow?: number;
};

function getCodexUsageSummary(
  threadKey: string,
  actions?: ChatActions,
  messages?: any,
): UsageSummary | undefined {
  const map = messages ?? actions?.store?.get("messages");
  if (!map || !actions?.getMessagesInThread) return undefined;
  const root = getMessageByKey(map, threadKey);
  if (!root) return undefined;
  const rootDate = root.get("date");
  const rootIso =
    rootDate instanceof Date
      ? rootDate.toISOString()
      : typeof rootDate === "string"
        ? rootDate
        : new Date(rootDate).toISOString();
  const seq = actions.getMessagesInThread(rootIso);
  if (!seq) return undefined;
  const threadMessages: ChatMessageTyped[] =
    typeof seq.toArray === "function" ? seq.toArray() : Array.from(seq);
  // Messages can arrive out of order from the SyncDB; normalize to chronological
  // order so usage totals reflect the most recent turn.
  const sortedMessages = threadMessages.sort((a, b) => {
    const aDate = toMsSafe(a?.get("date"));
    const bDate = toMsSafe(b?.get("date"));
    return aDate - bDate;
  });
  let latest;
  let totalTokens = 0;
  let usedTokens: number | undefined;
  let contextWindow: number | undefined;
  let hasAggregate = false;
  for (const entry of sortedMessages) {
    const usage: any = entry.get("acp_usage") ?? entry.get("codex_usage");
    if (!usage) continue;
    const usageData = typeof usage?.toJS === "function" ? usage.toJS() : usage;
    if (usageData?.total_tokens != null) {
      totalTokens = usageData.total_tokens;
      hasAggregate = true;
    } else if (!hasAggregate) {
      totalTokens +=
        (usageData?.input_tokens ?? 0) + (usageData?.cached_input_tokens ?? 0);
    }
    if (usageData?.model_context_window != null) {
      contextWindow = usageData.model_context_window;
    }
    const turnUsed = calcUsedTokens(usageData);
    if (turnUsed != null) {
      usedTokens = turnUsed;
    }
    latest = usageData;
  }
  if (!latest && totalTokens === 0) {
    return undefined;
  }
  return { latest, totalTokens, usedTokens, contextWindow };
}

function getMessageByKey(map, key: string): ChatMessageTyped | undefined {
  if (!key) return undefined;
  let candidates;
  try {
    candidates = [
      key,
      toMsString(key),
      `${parseInt(key, 10)}`,
      new Date(parseInt(key, 10)).toISOString(),
    ];
  } catch {
    return undefined;
  }
  for (const k of candidates) {
    if (!k) continue;
    const msg = map.get(k);
    if (msg != null) return msg;
  }
  return undefined;
}

function getModelContextWindow(model?: string): number | undefined {
  if (!model) return DEFAULT_CONTEXT_WINDOW;
  const entries = Object.entries(MODEL_CONTEXT_WINDOWS);
  for (const [prefix, window] of entries) {
    if (model.startsWith(prefix)) {
      return window;
    }
  }
  return DEFAULT_CONTEXT_WINDOW;
}

const DEFAULT_CONTEXT_WINDOW = 272_000;
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-5.1-codex-max": 272_000,
  "gpt-5.1-codex": 272_000,
  "gpt-5.1-codex-mini": 136_000,
  "gpt-5.1": 272_000,
};

function getReasoningForModel({
  models,
  modelValue,
  desired,
}: {
  models: ModelOption[];
  modelValue?: string;
  desired?: string;
}): string | undefined {
  if (!models.length) return undefined;
  const model =
    models.find((m) => m.value === modelValue) ?? models[0] ?? undefined;
  const options = model?.reasoning;
  if (!options?.length) return undefined;
  const match = options.find((r) => r.id === desired);
  return match?.id ?? options.find((r) => r.default)?.id ?? options[0]?.id;
}

function renderOptionWithDescription({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div style={{ lineHeight: "18px" }}>
      <div>{title}</div>
      {description ? (
        <div style={{ fontSize: 11, color: "#888", lineHeight: "14px" }}>
          {description}
        </div>
      ) : null}
    </div>
  );
}

function calcUsedTokens(usage: any): number | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const keys = [
    "input_tokens",
    "cached_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
  ] as const;
  let total = 0;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
    }
  }
  return total > 0 ? total : undefined;
}

function toMsSafe(value: any): number {
  if (value instanceof Date) {
    const ms = value.valueOf();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function defaultWorkingDir(chatPath: string): string {
  if (!chatPath) return ".";
  const i = chatPath.lastIndexOf("/");
  if (i <= 0) return ".";
  return chatPath.slice(0, i);
}
