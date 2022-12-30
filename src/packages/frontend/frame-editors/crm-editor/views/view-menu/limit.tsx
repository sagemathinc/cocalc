import { InputNumber, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";

export default function limitMenu({
  limit,
  setLimit,
  setRecordHeight,
  recordHeight,
}) {
  return {
    label: <span style={{ padding: "5px" }}>Limit ({limit})</span>,
    key: "limit",
    icon: <Icon name="database" />,
    children: [
      {
        disabled: true,
        label: <Limit limit={limit} setLimit={setLimit} />,
        key: "the-limit",
      },
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
    ],
  };
}

function Limit({ limit, setLimit }) {
  return (
    <Space>
      <div style={{ color: "#666" }}>Limit on number of results:</div>
      <InputNumber
        style={{ marginBottom: "7.5px" /* ugly hack */ }}
        min={1}
        max={1000}
        step={25}
        defaultValue={limit}
        onChange={(value) => {
          if (value) {
            setLimit(value);
          }
        }}
      />
    </Space>
  );
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
