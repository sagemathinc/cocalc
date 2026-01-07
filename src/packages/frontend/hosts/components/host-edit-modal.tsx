import { Form, Input, InputNumber, Modal } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { Host } from "@cocalc/conat/hub/api/hosts";

type HostEditModalProps = {
  open: boolean;
  host?: Host;
  saving?: boolean;
  onCancel: () => void;
  onSave: (
    id: string,
    values: { name: string; cpu?: number; ram_gb?: number; disk_gb?: number },
  ) => Promise<void> | void;
};

export const HostEditModal: React.FC<HostEditModalProps> = ({
  open,
  host,
  saving,
  onCancel,
  onSave,
}) => {
  const [form] = Form.useForm();
  const isSelfHost = host?.machine?.cloud === "self-host";
  const readPositive = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed);
  };
  const currentCpu = readPositive(host?.machine?.metadata?.cpu);
  const currentRam = readPositive(host?.machine?.metadata?.ram_gb);
  const currentDisk = readPositive(host?.machine?.disk_gb);
  const diskMin = currentDisk ?? 10;
  const diskMax = Math.max(2000, diskMin);

  React.useEffect(() => {
    if (host) {
      form.setFieldsValue({
        name: host.name,
        cpu: currentCpu ?? 2,
        ram_gb: currentRam ?? 8,
        disk_gb: currentDisk ?? 100,
      });
    } else {
      form.resetFields();
    }
  }, [form, host, currentCpu, currentRam, currentDisk]);

  const handleOk = async () => {
    const values = await form.validateFields();
    if (!host) return;
    await onSave(host.id, values);
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
        {isSelfHost && (
          <>
            <Form.Item
              label="vCPU"
              name="cpu"
              tooltip="Update requires a brief stop/start of the VM."
              extra="Safe range: 1–64 vCPU"
            >
              <InputNumber min={1} max={64} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="Memory (GB)"
              name="ram_gb"
              tooltip="Update requires a brief stop/start of the VM."
              extra="Safe range: 1–512 GB"
            >
              <InputNumber min={1} max={512} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="Disk size (GB)"
              name="disk_gb"
              tooltip="Disk can only grow. Shrinking is not supported."
              extra={`Current minimum: ${diskMin} GB (grow only)`}
            >
              <InputNumber min={diskMin} max={diskMax} style={{ width: "100%" }} />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
};
