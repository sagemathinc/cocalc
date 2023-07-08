/*
React component used from edit-license for editing the PurchaseInfo about one
single license.  It doesn't manage actually coordinating purchases, showing prices
or anything like that.
*/

import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import type { Changes } from "@cocalc/util/purchases/cost-to-edit-license";
import {
  Alert,
  DatePicker,
  InputNumber,
  Switch,
  Select,
  Table,
  Tag,
} from "antd";
import dayjs from "dayjs";
import { MAX } from "@cocalc/util/licenses/purchase/consts";
import { useMemo } from "react";

type Field =
  | "start"
  | "end"
  | "quantity"
  | "custom_cpu"
  | "custom_ram"
  | "custom_disk"
  | "custom_member"
  | "custom_uptime";

interface Props {
  info: PurchaseInfo;
  onChange: (info: PurchaseInfo) => void;
  style?;
  disabledFields?: Set<Field>;
  hiddenFields?: Set<Field>;
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

const END_PRESETS: {
  label: string;
  number: number;
  interval: "week" | "month" | "year";
}[] = [
  { label: "Week", number: 1, interval: "week" },
  { label: "Month", number: 1, interval: "month" },
  { label: "3 Months", number: 3, interval: "month" },
  { label: "4 Months", number: 4, interval: "month" },
  { label: "Year", number: 1, interval: "year" },
];

export default function LicenseEditor({
  info,
  onChange,
  style,
  disabledFields,
  hiddenFields,
}: Props) {
  const handleFieldChange = (field: keyof Changes) => (value: any) => {
    if (field == "start" || field == "end") {
      value = value?.toDate();
    }
    onChange({ ...info, [field]: value });
  };

  if (info.type == "vouchers") {
    return <Alert type="error" message="Editing vouchers is not allowed." />;
  }

  const isSubscription = info.subscription != null && info.subscription != "no";

  const endPresets = useMemo(() => {
    if (isSubscription || info.start == null) {
      return null;
    }

    const start = dayjs(info.start);
    return (
      <div style={{ marginTop: "8px" }}>
        {END_PRESETS.map(({ label, interval, number }) => (
          <Tag
            style={{ cursor: "pointer" }}
            color="blue"
            onClick={() =>
              handleFieldChange("end")(start.add(number, interval))
            }
          >
            {label}
          </Tag>
        ))}
      </div>
    );
  }, [isSubscription, info.end]);

  let data = [
    {
      key: "start",
      field: "Start Date",
      value: (
        <DatePicker
          disabled={
            (info.start != null && info.start <= new Date()) ||
            isSubscription ||
            disabledFields?.has("start")
          }
          value={info.start ? dayjs(info.start) : undefined}
          onChange={handleFieldChange("start")}
          disabledDate={(current) => current < dayjs().startOf("day")}
        />
      ),
    },
    {
      key: "end",
      field: "End Date",
      value: (
        <div>
          <DatePicker
            disabled={isSubscription || disabledFields?.has("end")}
            value={info.end ? dayjs(info.end) : undefined}
            onChange={handleFieldChange("end")}
            disabledDate={(current) => {
              if (current <= dayjs().startOf("day")) {
                return true;
              }
              if (info.start != null && current <= dayjs(info.start)) {
                return true;
              }
              return false;
            }}
          />
          {isSubscription && (
            <div style={{ color: "#666", marginTop: "15px" }}>
              Editing the end date of a subscription license is not allowed.
            </div>
          )}
          {endPresets}
        </div>
      ),
    },

    ...(info.type == "quota"
      ? [
          {
            key: "quantity",
            field: "Run Limit",
            value: (
              <InputNumber
                disabled={disabledFields?.has("quantity")}
                min={1}
                step={1}
                value={info.quantity}
                onChange={handleFieldChange("quantity")}
                addonAfter={"Projects"}
              />
            ),
          },
          {
            key: "custom_ram",
            field: "RAM",
            value: (
              <InputNumber
                disabled={disabledFields?.has("custom_ram")}
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
            key: "custom_disk",
            field: "Disk",
            value: (
              <InputNumber
                disabled={disabledFields?.has("custom_disk")}
                min={3}
                max={MAX.disk}
                step={1}
                value={info.custom_disk}
                onChange={handleFieldChange("custom_disk")}
                addonAfter={"GB"}
              />
            ),
          },
          {
            key: "custom_cpu",
            field: "CPU",
            value: (
              <InputNumber
                disabled={disabledFields?.has("custom_cpu")}
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
            key: "custom_member",
            field: "Member Hosting",
            value: (
              <Switch
                disabled={disabledFields?.has("custom_member")}
                checked={info.custom_member}
                onChange={handleFieldChange("custom_member")}
              />
            ),
          },
          {
            key: "custom_uptime",
            field: "Idle Timeout",
            value: (
              <Select
                disabled={disabledFields?.has("custom_uptime")}
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

  if (hiddenFields) {
    data = data.filter((x) => !hiddenFields.has(x.key as Field));
  }

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
