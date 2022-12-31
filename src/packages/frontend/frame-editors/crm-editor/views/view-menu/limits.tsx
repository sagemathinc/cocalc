import { Button, InputNumber, Popover, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { DEFAULT_LIMIT, DEFAULT_RECORD_HEIGHT } from "../view";

export default function LimitMenu({
  limit,
  setLimit,
  setRecordHeight,
  recordHeight,
}) {
  let n = 0;
  if (DEFAULT_LIMIT != limit) n += 1;
  if (DEFAULT_RECORD_HEIGHT != recordHeight) n += 1;
  return (
    <Popover
      placement="bottom"
      content={
        <Space direction="vertical" style={{ color: "#666" }}>
          <Limit limit={limit} setLimit={setLimit} />
          <Height
            setRecordHeight={setRecordHeight}
            recordHeight={recordHeight}
          />
        </Space>
      }
      trigger="click"
    >
      <Button
        type="text"
        style={{
          backgroundColor: n > 0 ? "yellow" : undefined,
        }}
      >
        <Icon name="database" />
        Limits
      </Button>
    </Popover>
  );
}

function Limit({ limit, setLimit }) {
  return (
    <Space>
      Limit number of results
      <InputNumber
        min={1}
        max={1000}
        step={25}
        value={limit}
        onChange={(value) => {
          if (value) {
            setLimit(value);
          }
        }}
      />
      <Button
        disabled={limit == DEFAULT_LIMIT}
        type="text"
        onClick={() => setLimit(DEFAULT_LIMIT)}
      >
        Reset
      </Button>
    </Space>
  );
}

function Height({ setRecordHeight, recordHeight }) {
  return (
    <Space>
      Limit height of records
      <InputNumber
        placeholder="Height..."
        onChange={(value) => setRecordHeight(value)}
        value={recordHeight}
        min={20}
        max={3000}
        step={50}
      />
      <Button
        disabled={recordHeight == DEFAULT_RECORD_HEIGHT}
        type="text"
        onClick={() => setRecordHeight(DEFAULT_RECORD_HEIGHT)}
      >
        Reset
      </Button>
    </Space>
  );
}
