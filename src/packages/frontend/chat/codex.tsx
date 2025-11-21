import {
  Button,
  Form,
  Input,
  Modal,
  Space,
  Typography,
  Select,
  Switch,
} from "antd";
import {
  React,
  useEffect,
  useMemo,
  useState,
} from "@cocalc/frontend/app-framework";
import {
  DEFAULT_CODEX_MODELS,
  DEFAULT_CODEX_MODEL,
  type CodexReasoningLevel,
} from "@cocalc/util/ai/codex";
import type { ChatActions } from "./actions";

const { Paragraph, Text } = Typography;

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
    form.resetFields();
    form.setFieldsValue({
      workingDirectory: defaultWorkingDir(chatPath),
      sessionId: "",
      model: initialModels[0]?.value ?? DEFAULT_CODEX_MODEL,
      reasoning:
        initialModels[0]?.reasoning?.find((r) => r.default)?.id ??
        initialModels[0]?.reasoning?.[0]?.id,
      envHome: "",
      envPath: "",
      allowWrite: false,
    });
  }, [threadKey, chatPath, form]);

  const selectedModelValue = Form.useWatch("model", form);
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
    if (actions) {
      actions.setCodexConfig?.(threadKey, values);
    }
    setOpen(false);
  };

  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        Codex Config
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
