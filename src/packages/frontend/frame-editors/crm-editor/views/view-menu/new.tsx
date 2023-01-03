import { useEffect, useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Divider, Popover, Space } from "antd";
import { TimeAgo } from "@cocalc/frontend/components";
import { field_cmp } from "@cocalc/util/misc";
import useViews from "../../syncdb/use-views";
import useViewControl from "../../frame/use-view-control";
import useSortFields from "../../syncdb/use-sort-fields";
import useOrderFields from "../../syncdb/use-order-fields";

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
  table,
}) {
  const label =
    addedRecords.length == 0 ? "New" : `New (${addedRecords.length})`;
  const [open, setOpen] = useState<boolean>(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
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
            <RecentRecords
              addedRecords={addedRecords}
              table={table}
              setOpen={setOpen}
            />
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

function RecentRecords({ addedRecords, table, setOpen }) {
  const { views, saveView } = useViews(table);
  const { switchToView } = useViewControl(table);

  const newViewId = useMemo(() => {
    if (views == null) return "";
    for (const view of views) {
      if (view.name == "Newly Created") {
        return view.id;
      }
    }
    // This saveView needs to happen outside this render loop.
    // It triggers update of views and then the code above.
    setTimeout(() => {
      const newView = { type: "grid", name: "Newly Created", id: undefined };
      saveView(newView);
    }, 0);
    return "";
  }, [views]);
  const [, setSortField] = useSortFields({ id: newViewId });
  const [orderFields, setOrderFields] = useOrderFields({
    id: newViewId,
    fields: ["id", "created"],
  });
  useEffect(() => {
    if (!newViewId) return;
    // ensure the sort and field order is correct
    setSortField("id", "id", "descending", 0);
    setOrderFields(
      ["id", "created"].concat(
        orderFields.filter((x) => x != "id" && x != "created")
      )
    );
  }, [newViewId]);

  const cmp = field_cmp("timestamp");
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Divider style={{ margin: 0 }}>Recent</Divider>
      {addedRecords
        .sort((a, b) => -cmp(a, b))
        .map(({ id, timestamp, viewName, viewId }) => (
          <div key={id}>
            <Button
              style={{ width: "250px" }}
              type="link"
              disabled={!newViewId}
              onClick={() => {
                switchToView(newViewId);
                setOpen(false);
                // open the given record itself?  Maybe too annoying...
              }}
            >
              <span style={{ marginRight: "15px" }}>id={id}</span>
              (<TimeAgo date={timestamp} />)
            </Button>
            <Button
              style={{ width: "150px" }}
              type="text"
              onClick={() => {
                switchToView(viewId);
                setOpen(false);
              }}
            >
              <div
                style={{
                  overflow: "hidden",
                  width: "100%",
                  textOverflow: "ellipsis",
                }}
              >
                {viewName}
              </div>
            </Button>
          </div>
        ))}
    </Space>
  );
}
