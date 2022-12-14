import { useMemo, useState, CSSProperties } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Alert, Button, Space, Table } from "antd";
import { EditableContext as EditableContextOld } from "../edit";
import { EditableContext } from "../fields/context";
import { useTable } from "../querydb/table-hook";
import { client_db } from "@cocalc/util/db-schema";
import { fieldToLabel } from "../util";
import { Icon } from "@cocalc/frontend/components";
import { SelectTimeKey } from "./time-keys";
import Gallery from "./gallery";
import Calendar from "./calendar";
import type { ViewType } from "../types";
import { getTableDescription } from "../tables";
import { SCHEMA } from "@cocalc/util/db-schema";

interface Props {
  view: ViewType;
  table: string;
  style?: CSSProperties;
  height?: number | string;
}

export default function View({ table, view, style, height }: Props) {
  const { title, query, expandable, columns, allowCreate, changes } = useMemo(
    () => getTableDescription(table),
    [table]
  );

  const [timeKey, setTimeKey] = useState<string | undefined>(undefined);
  const rowKey = useMemo(() => {
    const dbtable = Object.keys(query)[0];
    if (!dbtable) {
      throw Error("invalid query");
    }
    const keys = client_db.primary_keys(dbtable);
    if (keys.length != 1) {
      throw Error("must be a unique primary key");
    }
    return keys[0];
  }, [table]);

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
    const dbtable = Object.keys(query)[0];
    const now = webapp_client.server_time();

    // todo -- set times and required time fields on server instead
    const x: any = {};
    for (const timefield of ["created", "last_edited"]) {
      if (SCHEMA[dbtable].user_query?.set?.required_fields?.[timefield]) {
        x[timefield] = now;
      }
    }

    await webapp_client.query_client.query({
      query: { [dbtable]: x },
      options: [{ set: true }],
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
          pagination={
            false /* disabled for now -- TODO: will use virtuoso instead... */
          }
        />
      );
      break;
    default:
      body = <div>Unsupported view type "{view}"</div>;
  }

  return (
    <EditableContext.Provider value={editableContext}>
      <EditableContextOld.Provider value={editableContext}>
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
      </EditableContextOld.Provider>
    </EditableContext.Provider>
  );
}
