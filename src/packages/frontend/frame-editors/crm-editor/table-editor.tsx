import { getTableDescription, getTables } from "./tables";
import DBTable, { View } from "./db-table";
import { Button, Radio, Select, Space, Tabs } from "antd";
import { useMemo, ReactNode, useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { capitalize } from "@cocalc/util/misc";

interface TabItem {
  label: ReactNode;
  key: string;
  children: ReactNode;
}

export default function TableEditor() {
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <TableNavigator />
    </div>
  );
}

function TableNavigator() {
  const items = useMemo(() => {
    const items: TabItem[] = [];
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
      type="card"
      activeKey={activeKey}
      onChange={(activeKey: string) => {
        actions.set_frame_tree({ id, "data-tab": activeKey });
      }}
      size="small"
      items={items}
      style={{ margin: "15px" }}
    />
  );
}

function TabItem(props) {
  const { actions, id, desc } = useFrameContext();
  const viewKey = `data-view-${props.name}`;
  const view = useMemo(() => {
    return desc.get(viewKey, "table");
  }, [desc]);

  const items = useMemo(() => {
    const items: TabItem[] = [];
    for (const view of ["table", "cards", "calendar"]) {
      items.push({
        label: capitalize(view),
        key: view,
        children: <DBTable {...props} view={view} />,
      });
    }
    items.push({
      label: <SelectNewView />,
      key: "__new__",
      children: <div style={{ color: "#888" }}>Create a new view.</div>,
    });
    return items;
  }, []);

  return (
    <Tabs
      tabPosition="left"
      activeKey={view}
      onChange={(view: string) => {
        actions.set_frame_tree({ id, [viewKey]: view });
      }}
      size="small"
      items={items}
      style={{ margin: "15px" }}
    />
  );
}

function SelectNewView() {
  const options = [
    { value: "table", label: "Grid" },
    { value: "cards", label: "Gallery" },
    { value: "calendar", label: "Calendar" },
  ];
  return (
    <Select
      placeholder="Create..."
      options={options}
      style={{ width: "125px" }}
    />
  );
}
