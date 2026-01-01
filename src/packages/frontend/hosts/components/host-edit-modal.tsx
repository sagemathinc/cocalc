import { Form, Input, Modal } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { Host } from "@cocalc/conat/hub/api/hosts";

type HostEditModalProps = {
  open: boolean;
  host?: Host;
  saving?: boolean;
  onCancel: () => void;
  onSave: (id: string, name: string) => Promise<void> | void;
};

export const HostEditModal: React.FC<HostEditModalProps> = ({
  open,
  host,
  saving,
  onCancel,
  onSave,
}) => {
  const [form] = Form.useForm();

  React.useEffect(() => {
    if (host) {
      form.setFieldsValue({ name: host.name });
    } else {
      form.resetFields();
    }
  }, [form, host]);

  const handleOk = async () => {
    const values = await form.validateFields();
    if (!host) return;
    await onSave(host.id, values.name);
  };

  return (
    <Modal
      title="Edit host"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={saving}
      okText="Save"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="Name"
          name="name"
          rules={[
            { required: true, message: "Please enter a name" },
            { max: 100, message: "Name is too long" },
          ]}
        >
          <Input placeholder="Host name" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
