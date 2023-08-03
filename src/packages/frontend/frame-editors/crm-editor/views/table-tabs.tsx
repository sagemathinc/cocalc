import { Alert, Modal, Select, Tabs } from "antd";
import { getTableDescription, getTables } from "../tables";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  CSSProperties,
  ReactNode,
} from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import Views from "./index";
import {
  renderTabBar,
  SortableTabs,
  useItemContext,
} from "@cocalc/frontend/components/sortable-tabs";
import { arrayMove } from "@dnd-kit/sortable";
import useTables from "../syncdb/use-tables";
import { PlusOutlined } from "@ant-design/icons";
import { Icon } from "@cocalc/frontend/components";
import { cmp } from "@cocalc/util/misc";

interface TabItem {
  label: ReactNode;
  key: string;
  children: ReactNode;
  style?: CSSProperties;
}

function Label({ table }) {
  const { width } = useItemContext();
  let icon, title;
  try {
    ({ icon, title } = getTableDescription(table));
  } catch (_) {
    icon = "bug";
    title = `Deprecated Table (${table})`;
  }
  return (
    <div style={{ width, overflow: "hidden", textOverflow: "ellipsis" }}>
      {icon != null && <Icon name={icon} />} {title}
    </div>
  );
}

const TABLES = new Set(getTables());

export default function TableTabs() {
  const [tables, setTables] = useTables();

  const items = useMemo(() => {
    const items: TabItem[] = [];

    for (const table of tables) {
      if (!TABLES.has(table)) continue;
      const children = <Views table={table} style={{ margin: "0px 15px" }} />;
      items.push({
        label: <Label table={table} />,
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

  const [adding, setAdding] = useState<boolean>(items.length == 0);

  return (
    <SortableTabs
      style={{ height: "100%" }}
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
      {adding && (
        <AddTable setAdding={setAdding} tables={tables} setTables={setTables} />
      )}
      <Tabs
        type={"editable-card"}
        onEdit={(table: string, action: "add" | "remove") => {
          if (action == "remove") {
            const newTables = tables.filter((x) => x != table);
            if (newTables.length != tables.length) {
              setTables(newTables);
            }
          } else {
            setAdding(true);
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

function AddTable({ setAdding, tables, setTables }) {
  const options = useMemo(() => {
    const cur = new Set(tables);
    const all = getTables();
    return all
      .sort((t0, t1) =>
        cmp(getTableDescription(t0).title, getTableDescription(t1).title)
      )
      .filter((x) => !cur.has(x))
      .map((table) => {
        return { value: table, label: <Label table={table} /> };
      });
  }, [tables]);
  const [value, setValue] = useState<string[]>([]);

  // The following is all an ugly hack so that the Select is open and focused
  // once the modal is displayed.  It's to workaround the animation that makes
  // the modal appear, since trying to do any of this declaratively makes it
  // happen *before* things have appeared, hence it is all broken.
  const selectRef = useRef<any>(null);
  useEffect(() => {
    setTimeout(() => {
      selectRef.current?.focus();
    }, 400);
  }, []);

  return (
    <Modal
      closable={false}
      open
      title={
        <>
          <PlusOutlined style={{ marginRight: "10px" }} />
          Add {tables.length > 0 ? "Additional Tables" : "One or More Tables"}
        </>
      }
      onCancel={() => {
        setTables(tables.concat(value));
        setValue([]);
        setAdding(false);
      }}
      onOk={() => {
        setTables(tables.concat(value));
        setValue([]);
        setAdding(false);
      }}
    >
      Select one or more tables below to include them among the tables you track
      from this CRM file. You can drag them around later to change their order.
      {options.length == 0 && (
        <Alert
          showIcon
          style={{ margin: "10px 0 10px 0" }}
          type="info"
          message="There are no additional tables available.  If you close a table you will be able to restore it from here any time later."
        />
      )}
      {options.length > 0 && (
        <Select
          ref={selectRef}
          mode="multiple"
          allowClear
          value={value}
          style={{ width: "100%", marginTop: "10px" }}
          dropdownStyle={{ width: "100%" }}
          onChange={setValue}
          showSearch
          placeholder="Add Tables..."
          optionFilterProp="children"
          filterOption={(input, option) =>
            `${option?.value ?? ""}`.toLowerCase().includes(input.toLowerCase())
          }
          options={options}
        />
      )}
    </Modal>
  );
}
