import { useMemo, useState, CSSProperties, ReactNode } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Alert, Button, Space, Table } from "antd";
import { EditableContext } from "../edit";
import { useTable } from "../querydb/table-hook";
import { client_db } from "@cocalc/util/db-schema";
import { fieldToLabel } from "../util";
import { Icon } from "@cocalc/frontend/components";
import { SelectTimeKey } from "./time-keys";
import Gallery from "./gallery";
import Calendar from "./calendar";
import type { ViewType } from "../types";

interface Props {
  title?: ReactNode;
  query: object;
  expandable?;
  columns;
  allowCreate?: boolean;
  changes?: boolean;
  view: ViewType;
  style?: CSSProperties;
  height?;
}

export default function DBTable({
  title,
  query,
  expandable,
  columns,
  allowCreate,
  changes,
  view,
  style,
  height,
}: Props) {
  const [timeKey, setTimeKey] = useState<string | undefined>(undefined);
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

  const {
    data,
    refresh,
    editableContext,
    error: tableError,
  } = useTable({
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
      <Space wrap>
        <b>{title ?? fieldToLabel(table)}</b>
        <span style={{ fontWeight: 300 }}>
          {allowCreate ? " (editable)" : " (read only)"}
        </span>
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
    case "gallery":
      body = (
        <Gallery
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
    case "grid":
      body = (
        <Table
          size="middle"
          rowKey={rowKey}
          style={{ overflow: "auto" }}
          dataSource={data}
          columns={columns}
          bordered
          expandable={expandable}
          title={() => header}
          scroll={height ? { y: height } : undefined}
        />
      );
      break;
    default:
      body = <div>Unsupported view type "{view}"</div>;
  }

  return (
    <EditableContext.Provider value={editableContext}>
      {tableError && (
        <Alert
          type="error"
          message="Database Query Error"
          description={tableError}
        />
      )}
      {view == "calendar" && (
        <SelectTimeKey onChange={setTimeKey} query={query} />
      )}
      <div style={style}>{body}</div>
    </EditableContext.Provider>
  );
}
