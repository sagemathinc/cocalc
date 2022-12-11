import { getTableDescription, getTables } from "./tables";
import DBTable from "./db-table";
import { Radio, Tabs } from "antd";
import { useMemo, ReactNode, useState } from "react";

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
    <div>
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
  const [view, setView] = useState<"table" | "cards">("table");

  return (
    <div>
      <Radio.Group
        value={view}
        onChange={(e) => {
          setView(e.target.value);
        }}
      >
        <Radio.Button value="table">Table</Radio.Button>
        <Radio.Button value="cards">Cards</Radio.Button>
      </Radio.Group>
      <DBTable {...props} view={view} />
    </div>
  );
}
