import { useMemo, CSSProperties, ReactNode } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Button, Space, Table } from "antd";
import { EditableContext } from "./edit";
import { useTable } from "./table-hook";
import { client_db } from "@cocalc/util/db-schema";
import { fieldToLabel } from "./util";
import { Icon } from "@cocalc/frontend/components";

import Cards from "./cards";
import Calendar from "./calendar";

export type View = "cards" | "calendar" | "table";

interface Props {
  title?: ReactNode;
  query: object;
  expandable?;
  columns;
  allowCreate?: boolean;
  changes?: boolean;
  view?: "table" | "cards" | "calendar";
  style?: CSSProperties;
  height?;
  timeKey?: string;
}

export default function DBTable({
  title,
  query,
  expandable,
  columns,
  allowCreate,
  changes,
  view = "table",
  style,
  height,
  timeKey,
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
    const now = webapp_client.server_time();
    // todo -- set time on server!
    await webapp_client.query_client.query({
      query: { [table]: { created: now, last_edited: now } },
    });
    refresh();
  }

  const header = (
    <>
      <b>{title ?? fieldToLabel(table)}</b>
      <span style={{ fontWeight: 300 }}>
        {allowCreate ? " (editable)" : " (read only)"}
      </span>
      <Space wrap style={{ margin: "-5px 0 0 10px" }}>
        {allowCreate && (
          <Button onClick={addNew}>
            <Icon name="plus-circle" /> New
          </Button>
        )}
        {!changes && (
          <Button onClick={refresh}>
            <Icon name="refresh" /> Refresh
          </Button>
        )}
      </Space>
    </>
  );

  let body;
  switch (view) {
    case "cards":
      body = (
        <Cards
          height={height}
          rowKey={rowKey}
          data={data}
          columns={columns}
          title={header}
        />
      );
      break;
    case "calendar":
      body = (
        <Calendar
          style={style}
          data={data}
          columns={columns}
          title={header}
          timeKey={timeKey}
          rowKey={rowKey}
        />
      );
      break;
    default:
      body = (
        <Table
          size="middle"
          rowKey={rowKey}
          style={{ overflow: "auto", margin: "15px" }}
          dataSource={data}
          columns={columns}
          bordered
          expandable={expandable}
          title={() => header}
          scroll={height ? { y: height } : undefined}
        />
      );
      break;
  }

  return (
    <EditableContext.Provider value={editableContext}>
      <div style={style}>{body}</div>
    </EditableContext.Provider>
  );
}
