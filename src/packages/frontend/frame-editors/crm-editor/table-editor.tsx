import { getTables, getTableDescription } from "./tables";
import { Tabs } from "antd";
import { useMemo, CSSProperties, ReactNode } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { SyncdbContext } from "@cocalc/frontend/app-framework/syncdb";
import Views from "./views";
//import Home from "./home";
//import { Icon } from "@cocalc/frontend/components";
import { TagsProvider } from "./querydb/tags";
import { AgentsProvider } from "./querydb/use-agents";
import { QueryCache } from "./querydb/use-query-cache";
import "./ant-hacks.css";
import {
  renderTabBar,
  SortableTabs,
} from "@cocalc/frontend/components/sortable-tabs";

interface TabItem {
  label: ReactNode;
  key: string;
  children: ReactNode;
  style?: CSSProperties;
}

export default function TableEditor({ actions }) {
  const { items, tables } = useMemo(() => {
    const items: TabItem[] = [];
    const tables: string[] = [];

    // Home is far from done and maybe should be a different editor panel?

    for (const table of getTables()) {
      tables.push(table);
      const children = <Views table={table} style={{ margin: "0px 15px" }} />;
      const { title } = getTableDescription(table);
      items.push({
        label: title,
        key: table,
        children,
        style: { height: "100%", overflow: "hidden" },
      });
    }
    return { items, tables };
  }, []);

  const { id, desc } = useFrameContext();
  const activeKey = useMemo(() => {
    return desc.get("data-tab", items[0].key);
  }, [desc]);

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <SyncdbContext.Provider value={{ syncdb: actions._syncstring }}>
        <TagsProvider>
          <AgentsProvider>
            <QueryCache>
              <SortableTabs
                items={tables}
                onDragStart={(event) => {
                  if (event?.active?.id != activeKey) {
                    actions.set_frame_tree({
                      id,
                      "data-tab": event?.active?.id,
                    });
                  }
                }}
                onDragEnd={(event) => {
                  const { active, over } = event;
                  if (active == null || over == null || active.id == over.id) {
                    return;
                  }
                  const oldIndex = tables.indexOf(active.id);
                  const newIndex = tables.indexOf(over.id);
                  console.log("move", { oldIndex, newIndex });
                }}
              >
                <Tabs
                  type={"editable-card"}
                  onEdit={(table: string, action: "add" | "remove") => {
                    console.log("edit", table, action);
                  }}
                  renderTabBar={renderTabBar}
                  activeKey={activeKey}
                  onChange={(activeKey: string) => {
                    actions.set_frame_tree({ id, "data-tab": activeKey });
                  }}
                  size="small"
                  items={items}
                  style={{ height: "100%", margin: "5px" }}
                />
              </SortableTabs>
            </QueryCache>
          </AgentsProvider>
        </TagsProvider>
      </SyncdbContext.Provider>
    </div>
  );
}
