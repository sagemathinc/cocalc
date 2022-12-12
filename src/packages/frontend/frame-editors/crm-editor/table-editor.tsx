import { getTableDescription, getTables } from "./tables";
import DBTable, { View } from "./db-table";
import { Button, Radio, Space, Tabs } from "antd";
import { useMemo, ReactNode, useState } from "react";
import { SelectTimeKey, defaultTimeKey } from "./time-keys";
import { Icon } from "@cocalc/frontend/components";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

export default function TableEditor() {
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <TableNavigator />
    </div>
  );
}

function TableNavigator() {
  const items = useMemo(() => {
    const items: { label: ReactNode; key: string; children: ReactNode }[] = [];
    for (const name of getTables()) {
      const props = getTableDescription(name);
      const children = <TabItem {...props} />;
      items.push({ label: props.title, key: name, children });
    }
    return items;
  }, []);

  const { actions, id, desc } = useFrameContext();
  const activeKey = useMemo(() => {
    return desc.get("data-tab", items[0].key);
  }, [desc]);

  return (
    <Tabs
      activeKey={activeKey}
      onChange={(activeKey: string) => {
        actions.set_frame_tree({ id, "data-tab": activeKey });
      }}
      size="small"
      items={items}
      style={{ margin: "15px" }}
      tabPosition="left"
    />
  );
}

function TabItem(props) {
  const [timeKey, setTimeKey] = useState<string | undefined>(undefined);

  const { actions, id, desc } = useFrameContext();
  const viewKey = `data-view-${props.name}`;
  const view = useMemo(() => {
    return desc.get(viewKey, "table");
  }, [desc]);

  return (
    <div>
      <Space>
        <Radio.Group
          value={view}
          onChange={(e) => {
            actions.set_frame_tree({ id, [viewKey]: e.target.value });
            if (e.target.value == "calendar") {
              setTimeKey(defaultTimeKey(props.query));
            } else {
              setTimeKey(undefined);
            }
          }}
        >
          <Radio.Button value="table">Table</Radio.Button>
          <Radio.Button value="cards">Cards</Radio.Button>
          {defaultTimeKey(props.query) != null && (
            <Radio.Button value="calendar">Calendar</Radio.Button>
          )}
        </Radio.Group>
        {view == "calendar" && (
          <SelectTimeKey onChange={setTimeKey} query={props.query} />
        )}
      </Space>
      <DBTable {...props} view={view} timeKey={timeKey} />
    </div>
  );
}
