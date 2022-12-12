import { getTableDescription, getTables } from "./tables";
import { Tabs } from "antd";
import { useMemo, ReactNode } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { SyncdbContext } from "./syncdb/context";
import TableTab from "./table-tab";

interface TabItem {
  label: ReactNode;
  key: string;
  children: ReactNode;
}

export default function TableEditor({ actions }) {
  const items = useMemo(() => {
    const items: TabItem[] = [];
    for (const name of getTables()) {
      const props = getTableDescription(name);
      const children = <TableTab {...props} />;
      items.push({ label: props.title, key: name, children });
    }
    return items;
  }, []);

  const { id, desc } = useFrameContext();
  const activeKey = useMemo(() => {
    return desc.get("data-tab", items[0].key);
  }, [desc]);

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <SyncdbContext.Provider value={{ syncdb: actions._syncstring }}>
        <Tabs
          type="card"
          activeKey={activeKey}
          onChange={(activeKey: string) => {
            actions.set_frame_tree({ id, "data-tab": activeKey });
          }}
          size="small"
          items={items}
          style={{ margin: "15px" }}
        />
      </SyncdbContext.Provider>
    </div>
  );
}
