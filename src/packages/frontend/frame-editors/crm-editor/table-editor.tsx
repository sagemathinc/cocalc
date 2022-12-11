import { getTableDescription, getTables } from "./tables";
import DBTable, { View } from "./db-table";
import { Radio, Space, Tabs } from "antd";
import { useMemo, ReactNode, useState } from "react";
import { SelectTimeKey, defaultTimeKey } from "./time-keys";

export default function TableEditor({}) {
  const items = useMemo(() => {
    const items: { label: ReactNode; key: string; children: ReactNode }[] = [];
    for (const name of getTables()) {
      const props = getTableDescription(name);
      const children = <TabItem {...props} />;
      items.push({ label: props.title, key: name, children });
    }
    return items;
  }, []);

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <Tabs
        size="small"
        items={items}
        style={{ margin: "15px", height: "100%", overflow: "auto" }}
        tabPosition={"left"}
      />
    </div>
  );
}

function TabItem(props) {
  const [view, setView] = useState<View>("table");
  const [timeKey, setTimeKey] = useState<string | undefined>(undefined);

  return (
    <div>
      <Space>
        <Radio.Group
          value={view}
          onChange={(e) => {
            setView(e.target.value);
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
