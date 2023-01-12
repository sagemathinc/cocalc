import { Tabs } from "antd";
import { getTableDescription } from "../tables";
import { useMemo, CSSProperties, ReactNode } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import Views from "./index";
import {
  renderTabBar,
  SortableTabs,
} from "@cocalc/frontend/components/sortable-tabs";
import { arrayMove } from "@dnd-kit/sortable";
import useTables from "../syncdb/use-tables";

interface TabItem {
  label: ReactNode;
  key: string;
  children: ReactNode;
  style?: CSSProperties;
}

export default function TableTabs() {
  const [tables, setTables] = useTables();

  const items = useMemo(() => {
    const items: TabItem[] = [];

    for (const table of tables) {
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
  }, [tables]);

  const { actions, id, desc } = useFrameContext();
  const activeKey = useMemo(() => {
    return desc.get("data-tab", items.length > 0 ? items[0].key : undefined);
  }, [desc]);

  return (
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
        const newTables = arrayMove(tables, oldIndex, newIndex);
        setTables(newTables);
      }}
    >
      <Tabs
        type={"editable-card"}
        onEdit={(table: string, action: "add" | "remove") => {
          if (action == "remove") {
            const newTables = tables.filter((x) => x != table);
            if (newTables.length != tables.length) {
              setTables(newTables);
            }
          } else {
            console.log("add table");
          }
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
  );
}
