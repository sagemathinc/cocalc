/*
React component used from edit-license for editing the PurchaseInfo about one
single license.  It doesn't manage actually coordinating purchases, showing prices
or anything like that.
*/

import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import costToEditLicense, {
  Changes,
} from "@cocalc/util/purchases/cost-to-edit-license";
import { Alert, DatePicker, InputNumber, Switch, Select, Table } from "antd";
import dayjs from "dayjs";
import { MAX } from "@cocalc/util/licenses/purchase/consts";

interface Props {
  info: PurchaseInfo;
  onChange: (info: PurchaseInfo) => void;
  style?;
}

const columns = [
  {
    title: <div style={{ textAlign: "center" }}>Field</div>,
    dataIndex: "field",
    key: "field",
    render: (field) => <div style={{ margin: "15px" }}>{field}</div>,
  },
  {
    title: <div style={{ textAlign: "center" }}>Value</div>,
    dataIndex: "value",
    key: "value",
    render: (field) => <div style={{ margin: "15px" }}>{field}</div>,
  },
];

export default function LicenseEditor({ info, onChange, style }: Props) {
  const handleFieldChange = (field: keyof Changes) => (value: any) => {
    onChange({ ...info, [field]: value });
  };

  if (info.type == "vouchers") {
    return <Alert type="error" message="Editing vouchers is not allowed." />;
  }

  const data = [
    {
      key: "1",
      field: "Start Date",
      value: (
        <DatePicker
          value={info.start ? dayjs(info.start) : undefined}
          onChange={handleFieldChange("start")}
        />
      ),
    },
    {
      key: "2",
      field: "End Date",
      value: (
        <DatePicker
          value={info.end ? dayjs(info.end) : undefined}
          onChange={handleFieldChange("end")}
        />
      ),
    },
    {
      key: "3",
      field: "Run Limit",
      value: (
        <InputNumber
          min={1}
          step={1}
          value={info.quantity}
          onChange={handleFieldChange("quantity")}
          addonAfter={"Simultanous running projects"}
        />
      ),
    },
    ...(info.type == "quota"
      ? [
          {
            key: "4",
            field: "RAM",
            value: (
              <InputNumber
                min={1}
                max={MAX.ram}
                step={1}
                value={info.custom_ram}
                onChange={handleFieldChange("custom_ram")}
                addonAfter={"GB"}
              />
            ),
          },
          {
            key: "5",
            field: "Disk",
            value: (
              <InputNumber
                min={1}
                max={MAX.disk}
                step={1}
                value={info.custom_disk}
                onChange={handleFieldChange("custom_disk")}
                addonAfter={"GB"}
              />
            ),
          },
          {
            key: "6",
            field: "CPU",
            value: (
              <InputNumber
                min={1}
                max={MAX.cpu}
                step={1}
                value={info.custom_cpu}
                onChange={handleFieldChange("custom_cpu")}
                addonAfter={"Shared vCPU"}
              />
            ),
          },
          {
            key: "7",
            field: "Member Hosting",
            value: (
              <Switch
                checked={info.custom_member}
                onChange={handleFieldChange("custom_member")}
              />
            ),
          },
          {
            key: "8",
            field: "Idle Timeout",
            value: (
              <Select
                style={{ width: "100%" }}
                value={info.custom_uptime}
                onChange={handleFieldChange("custom_uptime")}
              >
                <Select.Option value="short">Short (30 minutes)</Select.Option>
                <Select.Option value="medium">Medium (2 hours)</Select.Option>
                <Select.Option value="day">Day (24 hours)</Select.Option>
                <Select.Option value="always_running">
                  Always Running
                </Select.Option>
              </Select>
            ),
          },
        ]
      : []),
  ];

  return (
    <Table
      bordered
      style={style}
      columns={columns}
      dataSource={data}
      pagination={false}
    />
  );
}
