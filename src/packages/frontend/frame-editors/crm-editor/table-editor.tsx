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

interface TabItem {
  label: ReactNode;
  key: string;
  children: ReactNode;
  style?: CSSProperties;
}

export default function TableEditor({ actions }) {
  const items = useMemo(() => {
    const items: TabItem[] = [];

    // Home is far from done and maybe should be a different editor panel?

    //     const items: TabItem[] = [
    //       {
    //         label: <Icon name="home" />,
    //         key: "home",
    //         children: <Home />,
    //         style: { height: "100%", overflow: "auto" },
    //       },
    //     ];
    for (const table of getTables()) {
      const children = <Views table={table} style={{ margin: "0px 15px" }} />;
      const { title } = getTableDescription(table);
      items.push({
        label: title,
        key: table,
        children,
        style: { height: "100%", overflow: "hidden" },
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
          <AgentsProvider>
            <QueryCache>
              <Tabs
                type="card"
                activeKey={activeKey}
                onChange={(activeKey: string) => {
                  actions.set_frame_tree({ id, "data-tab": activeKey });
                }}
                size="small"
                items={items}
                style={{ height: "100%" }}
              />
            </QueryCache>
          </AgentsProvider>
        </TagsProvider>
      </SyncdbContext.Provider>
    </div>
  );
}
