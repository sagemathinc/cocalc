import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Divider, Popover, Space } from "antd";
import { TimeAgo } from "@cocalc/frontend/components";
import { field_cmp } from "@cocalc/util/misc";

function singular(title: string): string {
  if (title == "People") {
    return "Person";
  }
  if (title.endsWith("s")) {
    return title.slice(0, -1);
  }
  return title;
}

export default function NewMenu({
  addNew,
  addedRecords,
  setAddedRecords,
  title,
}) {
  const label =
    addedRecords.length == 0 ? "New" : `New (${addedRecords.length})`;

  return (
    <Popover
      placement="bottom"
      overlayInnerStyle={{ maxHeight: "90vh", overflow: "auto" }}
      content={
        <Space direction="vertical">
          <div style={{ textAlign: "center" }}>
            <Button type="primary" onClick={addNew}>
              Create New {singular(title)}
            </Button>
          </div>
          {addedRecords.length > 0 && (
            <RecentRecords addedRecords={addedRecords} />
          )}
          {addedRecords.length > 0 && (
            <Button
              type="dashed"
              style={{ float: "right" }}
              onClick={() => setAddedRecords([])}
            >
              Clear
            </Button>
          )}
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

const STYLE = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  display: "inline-block",
};

function RecentRecords({ addedRecords }) {
  const cmp = field_cmp("timestamp");
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Divider style={{ margin: 0 }}>Recent</Divider>
      {addedRecords
        .sort((a, b) => -cmp(a, b))
        .map(({ id, timestamp, viewName }) => (
          <Button key={id} type="text" onClick={() => console.log("edit ", id)}>
            <div
              style={{
                ...STYLE,
                width: "100px",
              }}
            >
              {" "}
              id={id}
            </div>
            <div
              style={{
                ...STYLE,
                width: "150px",
                margin: "0 15px",
              }}
            >
              <TimeAgo date={timestamp} />
            </div>
            <div
              style={{
                ...STYLE,
                width: "150px",
              }}
            >
              {viewName}
            </div>
          </Button>
        ))}
    </Space>
  );
}
