import {
  Button,
  Form,
  Input,
  Modal,
  Space,
  Typography,
  Select,
  Switch,
  Progress,
} from "antd";
import {
  React,
  useEffect,
  useMemo,
  useState,
} from "@cocalc/frontend/app-framework";
import {
  DEFAULT_CODEX_MODELS,
  type CodexReasoningLevel,
} from "@cocalc/util/ai/codex";
import type { ChatMessageTyped } from "./types";
import { toMsString } from "./utils";
import type { ChatActions } from "./actions";

const { Paragraph, Text } = Typography;
const DEFAULT_MODEL_NAME = DEFAULT_CODEX_MODELS[0].name;

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
    if (!models.length) return;
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
      allowWrite: false,
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
    form.resetFields();
    form.setFieldsValue({
      ...merged,
      model,
      reasoning,
    });
  }, [models, threadKey, chatPath, actions, form]);

  const selectedModelValue = Form.useWatch("model", form);
  const selectedReasoningValue = Form.useWatch("reasoning", form);
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
    actions?.setCodexConfig?.(threadKey, values);
    setOpen(false);
  };

  const selectedModelLabel =
    models.find((m) => m.value === selectedModelValue)?.label ??
    DEFAULT_MODEL_NAME;
  const selectedReasoningLabel =
    reasoningOptions.find((r) => r.value === selectedReasoningValue)?.label ??
    "";

  const contextWindow = getModelContextWindow(selectedModelValue);
  const remainingPercent =
    usageSummary != null && contextWindow != null
      ? Math.max(
          0,
          Math.round(
            ((contextWindow - usageSummary.totalTokens) / contextWindow) * 100,
          ),
        )
      : null;

  const contextSummary =
    remainingPercent != null ? `${remainingPercent}% context left` : null;

  const contextMeter =
    remainingPercent != null ? (
      <div>
        <Text style={{ fontSize: 12, color: "#666" }}>{contextSummary}</Text>
        <Progress
          percent={100 - remainingPercent}
          status={
            remainingPercent < 20
              ? "exception"
              : remainingPercent < 40
                ? "active"
                : "normal"
          }
          showInfo={false}
          size="small"
        />
      </div>
    ) : null;

  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        Codex Config
        <div style={{ fontSize: 11, color: "#999" }}>
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
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Paragraph type="secondary">
            Configure how this chat connects to Codex.
          </Paragraph>
          {contextMeter}
          <Form form={form} layout="vertical">
            <Form.Item label="Working directory" name="workingDirectory">
              <Input placeholder="Defaults to chat directory" />
            </Form.Item>
            <Form.Item
              label="Session ID"
              name="sessionId"
              tooltip="Optional. Reuse a Codex session to keep continuity."
            >
              <Input placeholder="Leave blank to create a new session" />
            </Form.Item>
            <Form.Item label="Model" name="model">
              <Select
                placeholder="e.g., gpt-5.1-codex-max"
                options={models}
                optionRender={(option) =>
                  renderOptionWithDescription({
                    title: `${option.data.label}${
                      option.data.thinking ? ` (${option.data.thinking})` : ""
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
            <Form.Item label="Reasoning level" name="reasoning">
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
            <Form.Item
              label="HOME override"
              name="envHome"
              tooltip="Optional. Overrides HOME for the Codex CLI."
            >
              <Input placeholder="Use logged-in Codex HOME if needed" />
            </Form.Item>
            <Form.Item
              label="PATH override"
              name="envPath"
              tooltip="Optional. Ensures the codex CLI is on PATH."
            >
              <Input placeholder="Custom PATH for codex binary" />
            </Form.Item>
            <Form.Item
              label="Allow write access"
              name="allowWrite"
              valuePropName="checked"
              tooltip="Enable Codex to write files. Use with care."
            >
              <Switch />
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
  let latest;
  let totalTokens = 0;
  for (const entry of threadMessages) {
    const usage: any = entry.get("codex_usage");
    if (!usage) continue;
    const usageData = typeof usage?.toJS === "function" ? usage.toJS() : usage;
    totalTokens +=
      (usageData?.input_tokens ?? 0) + (usageData?.cached_input_tokens ?? 0);
    latest = usageData;
  }
  if (!latest && totalTokens === 0) {
    return undefined;
  }
  return { latest, totalTokens };
}

function getMessageByKey(map, key: string): ChatMessageTyped | undefined {
  if (!key) return undefined;
  const candidates = [
    key,
    toMsString(key),
    `${parseInt(key, 10)}`,
    new Date(parseInt(key, 10)).toISOString(),
  ];
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

function defaultWorkingDir(chatPath: string): string {
  if (!chatPath) return ".";
  const i = chatPath.lastIndexOf("/");
  if (i <= 0) return ".";
  return chatPath.slice(0, i);
}
