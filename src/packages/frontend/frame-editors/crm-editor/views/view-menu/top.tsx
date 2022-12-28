import { Icon } from "@cocalc/frontend/components";
import { TYPE_TO_ICON } from "../index";
import { Divider, Space, InputNumber } from "antd";

export default function topMenu({ name, view, setRecordHeight, recordHeight }) {
  return {
    label: name,
    key: "top-menu",
    icon: <Icon name={TYPE_TO_ICON[view]} />,
    children: [
      {
        type: "group",
        label: <Divider>View</Divider>,
        children: [
          {
            label: (
              <Height
                setRecordHeight={setRecordHeight}
                recordHeight={recordHeight}
              />
            ),
            key: "height",
            disabled: true,
          },
          {
            label: "Rename view",
            key: "rename",
          },
          {
            danger: true,
            label: "Delete view",
            key: "delete",
          },
        ],
      },
      {
        type: "group",
        label: <Divider>Other</Divider>,
        children: [
          {
            label: "Duplicate view",
            key: "duplicate",
          },
          {
            label: "Copy another view's configuration",
            key: "copy",
          },
        ],
      },
      {
        type: "group",
        label: <Divider>Download</Divider>,
        children: [
          {
            label: "Download CSV",
            key: "csv",
          },
          {
            label: "Download JSON",
            key: "json",
          },
        ],
      },
    ],
  };
}

function Height({ setRecordHeight, recordHeight }) {
  return (
    <Space>
      <div style={{ color: "#666" }}>Max height of records:</div>
      <InputNumber
        placeholder="Height..."
        onChange={(value) => setRecordHeight(value)}
        value={recordHeight}
        min={20}
        max={3000}
        step={50}
        style={{
          width: "100px",
          marginLeft: "5px",
          marginBottom: "5px",
        }}
      />
    </Space>
  );
}
