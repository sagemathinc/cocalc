import { Button, Form, Input, Modal, Space, Typography } from "antd";
import { React, useEffect, useState } from "@cocalc/frontend/app-framework";

const { Paragraph, Text } = Typography;

export interface CodexConfigButtonProps {
  threadKey: string;
  chatPath: string;
}

export function CodexConfigButton({
  threadKey,
  chatPath,
}: CodexConfigButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    // Reset form when switching threads.
    form.resetFields();
    form.setFieldsValue({
      workingDirectory: chatPath,
      sessionId: "",
      model: "gpt-5.1-codex-max",
      envHome: "",
      envPath: "",
    });
  }, [threadKey, chatPath, form]);

  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        Codex Config
      </Button>
      <Modal
        open={open}
        title="Codex Session Configuration"
        okText="Close"
        cancelButtonProps={{ style: { display: "none" } }}
        onOk={() => setOpen(false)}
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
              <Input placeholder="e.g., gpt-5.1-codex-max" />
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
