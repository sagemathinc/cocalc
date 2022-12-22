import { getTables, getTableDescription } from "./tables";
import { Tabs } from "antd";
import { useMemo, ReactNode } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { SyncdbContext } from "@cocalc/frontend/app-framework/syncdb";
import Views from "./views";
import Home from "./home";
import { Icon } from "@cocalc/frontend/components";
import { TagsProvider } from "./querydb/tags";

interface TabItem {
  label: ReactNode;
  key: string;
  children: ReactNode;
}

export default function TableEditor({ actions }) {
  const items = useMemo(() => {
    const items: TabItem[] = [
      { label: <Icon name="home" />, key: "home", children: <Home /> },
    ];
    for (const table of getTables()) {
      const children = <Views table={table} />;
      const { title } = getTableDescription(table);
      items.push({
        label: title,
        key: table,
        children,
      });
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
        <TagsProvider>
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
        </TagsProvider>
      </SyncdbContext.Provider>
    </div>
  );
}
