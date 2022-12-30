import { InputNumber, Popover, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";

export default function limitMenu({
  limit,
  setLimit,
  setRecordHeight,
  recordHeight,
}) {
  return {
    label: (
      <Popover
        placement="bottom"
        content={
          <div>
            <div>
              <Limit limit={limit} setLimit={setLimit} />
            </div>
            <div>
              <Height
                setRecordHeight={setRecordHeight}
                recordHeight={recordHeight}
              />
            </div>
          </div>
        }
        trigger="click"
      >
        <span style={{ padding: "5px" }}>Limit ({limit})</span>
      </Popover>
    ),
    key: "limit",
    icon: <Icon name="database" />,
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
