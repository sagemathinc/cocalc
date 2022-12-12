import { getTableDescription, getTables } from "./tables";
import DBTable from "./db-table";
import { Select, Tabs } from "antd";
import { useMemo, ReactNode, useState } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { capitalize } from "@cocalc/util/misc";
import { SyncdbContext } from "./syncdb/context";
import useViews from "./syncdb/use-views";

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
      const children = <TabItem {...props} />;
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

function TabItem(props) {
  const [views] = useViews(props.name);
  const { actions, id, desc } = useFrameContext();

  const viewKey = `data-view-${props.name}`;
  const view = useMemo<string | undefined>(() => {
    return desc.get(viewKey, views?.[0]?.id);
  }, [desc]);

  const items = useMemo(() => {
    const items: TabItem[] = [];
    for (const { name, id, type } of views ?? []) {
      items.push({
        label: capitalize(name),
        key: id,
        children: <DBTable {...props} view={type} />,
      });
    }
    items.push({
      label: (
        <NewView
          dbtable={props.name}
          onCreate={(view: string) => {
            actions.set_frame_tree({ id, [viewKey]: view });
          }}
        />
      ),
      key: "__new__",
      children: <div style={{ color: "#888" }}>Create a new view.</div>,
    });
    return items;
  }, [views]);

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

function NewView({ dbtable, onCreate }) {
  const [value, setValue] = useState<string | null>(null);
  const [_, setView] = useViews(dbtable);
  const options = [
    { value: "table", label: "Grid" },
    { value: "cards", label: "Gallery" },
    { value: "calendar", label: "Calendar" },
  ];
  return (
    <Select
      placeholder="New View..."
      value={value}
      options={options}
      style={{ width: "125px" }}
      onChange={(type: string) => {
        setValue(type);
        const newView = { type, id: undefined };
        setView(newView);
        onCreate(newView.id); // id gets set on creation.
        setValue("");
      }}
    />
  );
}
