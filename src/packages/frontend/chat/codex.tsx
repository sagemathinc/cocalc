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
import { React, useEffect, useState } from "@cocalc/frontend/app-framework";
import { DEFAULT_CODEX_MODELS } from "@cocalc/util/ai/codex";
import type { ChatActions } from "./actions";

const { Paragraph, Text } = Typography;

export interface CodexConfigButtonProps {
  threadKey: string;
  chatPath: string;
  actions?: ChatActions;
}

export function CodexConfigButton({
  threadKey,
  chatPath,
  actions,
}: CodexConfigButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [models, setModels] = useState<
    { name: string; thinking?: string; description?: string }[]
  >([]);

  useEffect(() => {
    const initialModels = DEFAULT_CODEX_MODELS.map((m) => ({
      name: m.name,
      thinking: m.reasoning?.find((r) => r.default)?.label,
      description: m.description,
    }));
    setModels(initialModels);
    form.resetFields();
    form.setFieldsValue({
      workingDirectory: defaultWorkingDir(chatPath),
      sessionId: "",
      model: initialModels[0]?.name ?? "gpt-5.1-codex-max",
      envHome: "",
      envPath: "",
      allowWrite: false,
    });
  }, [threadKey, chatPath, form]);

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
                options={models.map((m) => ({
                  value: m.name,
                  label: m.thinking
                    ? `${m.name} (${m.thinking})`
                    : m.name,
                  title: m.description,
                }))}
                showSearch
                allowClear
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

function defaultWorkingDir(chatPath: string): string {
  if (!chatPath) return ".";
  const i = chatPath.lastIndexOf("/");
  if (i <= 0) return ".";
  return chatPath.slice(0, i);
}
