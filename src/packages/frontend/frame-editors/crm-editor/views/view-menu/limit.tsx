import { InputNumber, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";

export default function limitMenu({ limit, setLimit }) {
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
