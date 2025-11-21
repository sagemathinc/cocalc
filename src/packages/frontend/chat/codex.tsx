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
  const currentUsage = Form.useWatch("codex_usage", form);
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

  const remainingPercent = currentUsage?.input_tokens
    ? Math.max(
        0,
        100 -
          Math.round(
            (currentUsage.input_tokens /
              (currentUsage.input_tokens + (currentUsage.output_tokens ?? 0))) *
              100,
          ),
      )
    : null;

  const contextLeft =
    remainingPercent != null ? (
      <div>
        <Text style={{ fontSize: 12, color: "#666" }}>
          {remainingPercent}% context left
        </Text>
        <Progress
          percent={remainingPercent}
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
          {contextLeft}
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
          {contextLeft}
          <Paragraph type="secondary">
            Configure how this chat connects to Codex. Values are stored in the
            first message metadata (future work); for now this modal is a
            convenient reminder of the session settings you intend to use.
          </Paragraph>
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
                    title: option.data.label,
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
          <Text type="secondary">
            Coming soon: Save/apply these settings and drive Codex via conat
            directly from chat.
          </Text>
        </Space>
      </Modal>
    </>
  );
}

export default CodexConfigButton;

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
