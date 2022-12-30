import { useMemo, useState, CSSProperties } from "react";
import { Alert, Button, Space } from "antd";
import { EditableContext } from "../fields/context";
import { useTable } from "../querydb/use-table";
import { client_db } from "@cocalc/util/db-schema";
import { SelectField, defaultField } from "./select-field-with-type";
import Gallery from "./gallery";
import Grid from "./grid";
import Calendar from "./calendar";
import Kanban from "./kanban";
import type { ViewType } from "../types";
import { Icon } from "@cocalc/frontend/components";
import { getTableDescription } from "../tables";
import ViewMenu from "./view-menu";
import { fieldToLabel } from "../util";
import useFilter from "./filter-input";
import { plural } from "@cocalc/util/misc";
import useHiddenFields from "../syncdb/use-hidden-fields";
import useSortFields from "../syncdb/use-sort-fields";
import useOrderFields from "../syncdb/use-order-fields";
import useViewParam from "../syncdb/use-view-param";
import useSearch from "../syncdb/use-search";
import { Loading } from "@cocalc/frontend/components";
import querydbSet from "../querydb/set";

const DEFAULT_RECORD_HEIGHT = 300;
export const DEFAULT_LIMIT = 100;

interface Props {
  view: ViewType;
  table: string;
  style?: CSSProperties;
  name: string;
  id: string;
}

export default function View({ table, view, style, name, id }: Props) {
  const {
    title,
    query,
    columns: allColumns,
    allowCreate,
    changes,
  } = useMemo(() => getTableDescription(table), [table]);
  const [limit, setLimit] = useViewParam<number>({
    id,
    name: "limit",
    defaultValue: DEFAULT_LIMIT,
  });
  const [search, setSearch] = useSearch({ id });
  const [sortFields, setSortField] = useSortFields({ id });

  const fields = useMemo(
    () => allColumns.map(({ dataIndex }) => dataIndex),
    [allColumns]
  );
  const [orderFields, setOrderFields] = useOrderFields({ id, fields });

  const [hiddenFields, setHiddenField] = useHiddenFields({ id });
  const columns = useMemo(() => {
    if (hiddenFields.size == 0) {
      return allColumns;
    }
    return allColumns.filter((x) => !hiddenFields.has(x.dataIndex));
  }, [hiddenFields, allColumns]);

  const [timeField, setTimeField] = useViewParam<string>({
    id,
    name: "time-field",
    defaultValue: defaultField(query, "timestamp", hiddenFields) ?? "",
  });

  const [categoryField, setCategoryField] = useViewParam<string>({
    id,
    name: "category-field",
    defaultValue: defaultField(query, "select", hiddenFields) ?? "",
  });

  const [recordHeight, setRecordHeight] = useViewParam<number>({
    id,
    name: "record-height",
    defaultValue: DEFAULT_RECORD_HEIGHT,
  });

  const rowKey = useMemo(() => {
    const dbtable = Object.keys(query)[0];
    if (!dbtable) {
      throw Error("invalid query");
    }
    const keys = client_db.primary_keys(dbtable);
    return keys[0];
  }, [table]);

  const {
    data,
    refresh,
    editableContext,
    error: tableError,
    saving,
    loading,
  } = useTable({ query, changes, sortFields, hiddenFields, search, limit });

  const { filteredData, numHidden, Filter } = useFilter({ data, id });

  const [addError, setAddError] = useState<string>("");

  async function addNew() {
    const dbtable = Object.keys(query)[0];

    const x: any = {};

    if (dbtable == "crm_tags") {
      // TODO: need a 'new editor' before it goes into the DB!
      x.name = "New Tag";
    }

    setAddError("");
    try {
      await querydbSet({ [dbtable]: x });
    } catch (err) {
      setAddError(`${err}`);
    }

    refresh();
  }

  const right = (
    <Space wrap style={{ float: "right" }}>
      <b>{title ?? fieldToLabel(table)}</b>
      {allowCreate && (
        <Button onClick={addNew}>
          <Icon name="plus-circle" /> New
        </Button>
      )}
      <Button onClick={refresh}>
        <Icon name="refresh" /> Refresh
      </Button>
    </Space>
  );

  const header = (
    <div>
      {right}{" "}
      <ViewMenu
        query={query}
        name={name}
        view={view}
        columns={allColumns}
        limit={limit}
        setLimit={setLimit}
        sortFields={sortFields}
        setSortField={setSortField}
        hiddenFields={hiddenFields}
        setHiddenField={setHiddenField}
        search={search}
        setSearch={setSearch}
        recordHeight={recordHeight}
        setRecordHeight={setRecordHeight}
        orderFields={orderFields}
        setOrderFields={setOrderFields}
      />
    </div>
  );
  let body;
  switch (view) {
    case "gallery":
      body = (
        <Gallery
          recordHeight={recordHeight}
          rowKey={rowKey}
          data={filteredData}
          columns={columns}
          allColumns={allColumns}
          title={header}
        />
      );
      break;
    case "kanban":
      body = (
        <Kanban
          recordHeight={recordHeight}
          rowKey={rowKey}
          data={filteredData}
          columns={columns}
          allColumns={allColumns}
          title={header}
          categoryField={categoryField}
          query={query}
        />
      );
      break;
    case "calendar":
      body = (
        <Calendar
          data={filteredData}
          columns={allColumns}
          allColumns={allColumns}
          title={header}
          timeField={timeField}
          rowKey={rowKey}
        />
      );
      break;
    case "grid":
      body = (
        <Grid
          recordHeight={recordHeight}
          data={filteredData}
          columns={columns}
          allColumns={allColumns}
          title={header}
          sortFields={sortFields}
          setSortField={setSortField}
        />
      );
      break;
    default:
      body = <div>Unsupported view type "{view}"</div>;
  }

  return (
    <EditableContext.Provider value={editableContext}>
      <div style={{ ...style, display: "flex", flexDirection: "column" }}>
        {loading && (
          <div style={{ float: "right" }}>
            <Loading delay={200} text="Loading from database..." />
          </div>
        )}
        {saving && (
          <div style={{ float: "right" }}>
            <Loading delay={200} text="Saving to database..." />
          </div>
        )}
        {tableError && (
          <Alert
            type="error"
            message="Database Query Error"
            description={tableError}
          />
        )}
        {addError && (
          <Alert
            type="error"
            message="Error Creating New Record"
            description={addError}
          />
        )}
        <Space>
          {view == "calendar" && (
            <SelectField
              type={"timestamp"}
              value={timeField}
              onChange={setTimeField}
              query={query}
              style={{ marginBottom: "5px" }}
              hiddenFields={hiddenFields}
            />
          )}
          {view == "kanban" && (
            <SelectField
              type={"select"}
              value={categoryField}
              onChange={setCategoryField}
              query={query}
              style={{ marginBottom: "5px" }}
              hiddenFields={hiddenFields}
            />
          )}
          {Filter}
          {numHidden > 0 && (
            <div style={{ marginBottom: "5px", color: "#666" }}>
              <Icon name="warning" /> Filtered: only showing{" "}
              {filteredData.length} of {data.length}{" "}
              {plural(data.length, "result")}
            </div>
          )}
        </Space>
        <div style={{ flex: 1, overflow: "hidden" }}>{body}</div>
      </div>
    </EditableContext.Provider>
  );
}
