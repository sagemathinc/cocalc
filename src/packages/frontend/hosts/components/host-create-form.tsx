import { Collapse, Form, Input } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import type { FormInstance } from "antd/es/form";
import type { HostCreateViewModel } from "../hooks/use-host-create-view-model";
import { HostCreateAdvancedFields } from "./host-create-advanced-fields";
import { HostCreateProviderFields } from "./host-create-provider-fields";

type HostCreateFormProps = {
  form: FormInstance;
  canCreateHosts: boolean;
  provider: HostCreateViewModel["provider"];
  onCreate: (vals: any) => Promise<void>;
};

export const HostCreateForm: React.FC<HostCreateFormProps> = ({
  form,
  canCreateHosts,
  provider,
  onCreate,
}) => {
  return (
    <Form
      layout="vertical"
      onFinish={onCreate}
      disabled={!canCreateHosts}
      form={form}
    >
      <Form.Item name="name" label="Name" initialValue="My host">
        <Input placeholder="My host" />
      </Form.Item>
      <HostCreateProviderFields provider={provider} />
      <Collapse ghost style={{ marginBottom: 8 }}>
        <Collapse.Panel header="Advanced options" key="adv">
          <HostCreateAdvancedFields provider={provider} />
        </Collapse.Panel>
      </Collapse>
    </Form>
  );
};
