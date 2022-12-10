import { useMemo, ReactNode } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Button, Space, Table } from "antd";
import { EditableContext } from "./edit";
import { useTable } from "./table";
import { client_db } from "@cocalc/util/db-schema";
import { capitalize, replace_all } from "@cocalc/util/misc";

interface Props {
  title?: ReactNode;
  query: object;
  expandable?;
  columns;
  allowCreate?: boolean;
  changes?: boolean;
}

export default function DBTable({
  title,
  query,
  expandable,
  columns,
  allowCreate,
  changes,
}: Props) {
  const { rowKey, table } = useMemo(() => {
    const table = Object.keys(query)[0];
    if (!table) {
      throw Error("invalid query");
    }
    const keys = client_db.primary_keys(table);
    if (keys.length != 1) {
      throw Error("must be a unique primary key");
    }
    const rowKey = keys[0];
    return { rowKey, table };
  }, [query]);

  const [data, refresh, editableContext] = useTable({
    query,
    changes,
  });

  async function addNew() {
    await webapp_client.query_client.query({
      query: { [table]: { created: new Date(), last_edited: new Date() } },
    });
    refresh();
  }

  return (
    <EditableContext.Provider value={editableContext}>
      <Table
        size="middle"
        rowKey={rowKey}
        style={{ overflow: "auto", margin: "15px" }}
        dataSource={data}
        columns={columns}
        bordered
        expandable={expandable}
        title={() => (
          <>
            <b>{title ?? capitalize(replace_all(table, "_", " "))}</b>
            <Space wrap style={{ float: "right" }}>
              {allowCreate && <Button onClick={addNew}>New</Button>}
              {!changes && <Button onClick={refresh}>Refresh</Button>}
            </Space>
          </>
        )}
      />
    </EditableContext.Provider>
  );
}
