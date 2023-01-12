import { Alert, Modal, Select, Tabs } from "antd";
import { getTableDescription } from "../tables";
import { useMemo, useState, CSSProperties, ReactNode } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import Views from "./index";
import {
  renderTabBar,
  SortableTabs,
} from "@cocalc/frontend/components/sortable-tabs";
import { arrayMove } from "@dnd-kit/sortable";
import useTables from "../syncdb/use-tables";
import { getTables } from "../tables";
import { PlusOutlined } from "@ant-design/icons";
import { plural } from "@cocalc/util/misc";

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

  const [adding, setAdding] = useState<boolean>(items.length == 0);

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
      <AddTable
        adding={adding}
        setAdding={setAdding}
        tables={tables}
        setTables={setTables}
      />
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

function AddTable({ adding, setAdding, tables, setTables }) {
  const options = useMemo(() => {
    const cur = new Set(tables);
    const all = getTables();
    return all
      .sort()
      .filter((x) => !cur.has(x))
      .map((table) => {
        return { value: table, label: getTableDescription(table).title };
      });
  }, [tables]);
  const [value, setValue] = useState<string[]>([]);

  return (
    <Modal
      open={adding}
      title={
        <>
          <PlusOutlined style={{ marginRight: "10px" }} />
          Add {tables.length > 0 ? "Additional Tables" : "One or More Tables"}
        </>
      }
      okText={`Add ${value.length} ${plural(value.length, "Table")}`}
      okButtonProps={value.length == 0 ? { disabled: true } : undefined}
      onOk={() => {
        setTables(tables.concat(value));
        setValue([]);
        setAdding(false);
      }}
      onCancel={() => setAdding(false)}
    >
      Select one or more tables below to include them among the tables you track
      from this CRM file. You can drag them around later to change their order.
      {options.length == 0 && (
        <Alert
          showIcon
          style={{ marginTop: "10px" }}
          type="info"
          message="There are no additional tables available."
        />
      )}
      {adding && options.length > 0 && (
        <Select
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
            `${option?.label ?? ""}`.toLowerCase().includes(input.toLowerCase())
          }
          options={options}
        />
      )}
    </Modal>
  );
}
