import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Popover, Space } from "antd";
import { TimeAgo } from "@cocalc/frontend/components";
import { field_cmp } from "@cocalc/util/misc";

export default function NewMenu({ addNew, addedRecords, setAddedRecords }) {
  const label =
    addedRecords.length == 0 ? "New" : `New (${addedRecords.length})`;

  return (
    <Popover
      placement="bottom"
      overlayInnerStyle={{ maxHeight: "90vh", overflow: "auto" }}
      content={
        <Space direction="vertical" style={{ textAlign: "center" }}>
          <Space>
            <Button onClick={addNew}>Create Record...</Button>
            {addedRecords.length > 0 && (
              <Button onClick={() => setAddedRecords([])}>Clear</Button>
            )}
          </Space>
          <RecentRecords addedRecords={addedRecords} />
        </Space>
      }
      trigger="click"
    >
      <Button
        type="text"
        style={{
          backgroundColor: addedRecords.length > 0 ? "#d7e9ff" : undefined,
        }}
      >
        <Icon name="plus-circle" />
        {label}
      </Button>
    </Popover>
  );
}

function RecentRecords({ addedRecords }) {
  const cmp = field_cmp("timestamp");
  return (
    <Space direction="vertical">
      {addedRecords
        .sort((a, b) => -cmp(a, b))
        .map(({ id, timestamp }) => (
          <Button key={id} type="text" onClick={() => console.log("edit ", id)}>
            id={id}
            <TimeAgo
              date={timestamp}
              style={{
                width: "150px",
                overflow: "hidden",
                marginLeft: "15px",
              }}
            />
          </Button>
        ))}
    </Space>
  );
}
