import { useMemo, useState, CSSProperties } from "react";
import { Alert, Card } from "antd";
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
import { useTableDescription } from "../tables";
import ViewMenu from "./view-menu";
import { fieldToLabel } from "../util";
import useFilterInput from "./filter-input";
import { plural } from "@cocalc/util/misc";
import useHiddenFields from "../syncdb/use-hidden-fields";
import useSortFields from "../syncdb/use-sort-fields";
import useOrderFields from "../syncdb/use-order-fields";
import useViewParam from "../syncdb/use-view-param";
import useSearch from "../syncdb/use-search";
import { Loading } from "@cocalc/frontend/components";
import { columnsToFieldMap } from "./view-menu/hide-fields";
import createNewRecord from "./create-new-record";
import RetentionView, { Retention, DEFAULT_RETENTION } from "./retention";

export const DEFAULT_RECORD_HEIGHT = 300;
export const DEFAULT_LIMIT = 100;

interface Props {
  view: ViewType;
  table: string;
  style?: CSSProperties;
  cardStyle?: CSSProperties;
  name: string;
  id: string;
}

export default function View({
  table,
  view,
  cardStyle,
  style,
  name,
  id,
}: Props) {
  const {
    title,
    query,
    columns: allColumns,
    allowCreate,
    changes,
  } = useTableDescription(table);
  const [limit, setLimit] = useViewParam<number>({
    id,
    name: "limit",
    defaultValue: DEFAULT_LIMIT,
  });

  const [search, setSearch] = useSearch({ id });
  const [sortFields, setSortField] = useSortFields({ id });

  const fields = useMemo(
    () => allColumns.map(({ dataIndex }) => dataIndex),
    [allColumns],
  );
  const [orderFields, setOrderFields] = useOrderFields({ id, fields });

  const [hiddenFields, setHiddenField] = useHiddenFields({ id });

  const columns = useMemo(() => {
    // (1) Sort as given by orderFields and (2) filter as given by hiddenFields.
    const fieldToColumn = columnsToFieldMap(allColumns);
    const columns = orderFields.map((field) => fieldToColumn[field]);
    if (hiddenFields.size == 0) {
      return columns;
    }
    return columns.filter((x) => !hiddenFields.has(x.dataIndex));
  }, [hiddenFields, orderFields, allColumns]);

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

  const [retention, setRetention] = useViewParam<Retention>({
    id,
    name: "retention",
    defaultValue: DEFAULT_RETENTION,
  });

  const dbtable: string = useMemo(() => {
    const tbl = Object.keys(query)[0];
    if (!tbl) {
      throw Error("invalid query");
    }
    return tbl;
  }, [query]);

  const rowKey = useMemo(() => {
    const keys = client_db.primary_keys(dbtable);
    return keys[0];
  }, [dbtable]);

  // only defined if there is not a compound primary key
  const primaryKey = useMemo(() => {
    const keys = client_db.primary_keys(dbtable);
    return keys.length == 1 ? keys[0] : undefined;
  }, [dbtable]);

  const {
    data,
    refresh,
    editableContext,
    error: tableError,
    saving,
    loading,
  } = useTable({ query, changes, sortFields, hiddenFields, search, limit });

  const { filteredData, numHidden, Filter, filter } = useFilterInput({
    data,
    id,
  });

  const [addError, setAddError] = useState<string>("");

  // Note -- we set the id to "" instead of the id of a view, since
  // this should be global to all views of this table.  If you want this
  // instead scoped to a single view (which might make sense), change
  // 'id: ""' to 'id'.  Global is probably best, since the point is to not
  // accidentally lose stuff.
  const [addedRecords, setAddedRecords] = useViewParam<
    { id: number; timestamp: number; viewName: string; viewId: string }[]
  >({
    id: "",
    name: `new-${table}`,
    defaultValue: [],
  });

  async function addNew() {
    setAddError("");
    let newId: number | null = null;
    try {
      newId = await createNewRecord({
        filter,
        search,
        dbtable,
        fields,
        hiddenFields,
      });
    } catch (err) {
      setAddError(`${err}`);
    }
    if (newId != null) {
      // UNCLEAR: We could filter to remove older records to save memory and
      // put in the new one.  But people might be annoyed by this and it is abitrary.
      // const now = Date.now();
      /// .filter((x) => x.timestamp >= now - 1000 * 60 * 5)
      addedRecords.push({
        id: newId,
        timestamp: Date.now(),
        viewName: name,
        viewId: id,
      });
      setAddedRecords([...addedRecords]);
    }
    refresh();
  }

  const header = (
    <ViewMenu
      id={id}
      query={query}
      name={name}
      title={title ?? fieldToLabel(table)}
      dbtable={dbtable}
      table={table}
      view={view}
      data={filteredData}
      viewCount={filteredData?.length ?? 0}
      tableLowerBound={data?.length ?? 0}
      allColumns={allColumns}
      columns={columns}
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
      rowKey={rowKey}
      primaryKey={primaryKey}
      addNew={allowCreate ? addNew : undefined}
      addedRecords={addedRecords}
      setAddedRecords={setAddedRecords}
      refresh={refresh}
      filters={
        <>
          {Filter}
          {numHidden > 0 && (
            <div style={{ marginBottom: "5px", color: "#666" }}>
              <Icon name="warning" /> Showing {filteredData.length} of{" "}
              {data.length} {plural(data.length, "match", "matches")}
            </div>
          )}
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
        </>
      }
    />
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
          categoryField={categoryField}
          query={query}
          refresh={refresh}
        />
      );
      break;
    case "calendar":
      body = (
        <Calendar
          data={filteredData}
          columns={allColumns}
          timeField={timeField}
          rowKey={rowKey}
        />
      );
      break;
    case "grid":
      body = (
        <Grid
          id={id}
          recordHeight={recordHeight}
          data={filteredData}
          columns={columns}
          sortFields={sortFields}
          setSortField={setSortField}
          primaryKey={primaryKey}
        />
      );
      break;
    case "retention":
      body = (
        <RetentionView retention={retention} setRetention={setRetention} />
      );
      break;
    default:
      body = <div>Unsupported view type "{view}"</div>;
  }

  return (
    <EditableContext.Provider value={editableContext}>
      <div
        style={{
          ...style,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {loading && (
          <div style={{ height: 0 }}>
            <Loading
              style={data.length > 0 ? { float: "right" } : undefined}
              delay={750}
              theme={data.length == 0 ? "medium" : undefined}
              text="Loading from database..."
            />
          </div>
        )}
        {saving && (
          <div style={{ height: 0 }}>
            <Loading
              style={{ float: "right" }}
              delay={1500}
              text="Saving to database..."
            />
          </div>
        )}
        {tableError && (
          <Alert
            style={{ margin: "30px 0" }}
            type="error"
            message="Database Query Error"
            description={tableError}
            closable
            onClose={refresh}
          />
        )}
        {addError && (
          <Alert
            style={{ margin: "30px 0" }}
            type="error"
            message="Error Creating New Record"
            description={addError}
            closable
            onClose={() => setAddError("")}
          />
        )}
        <div style={{ flex: 1, overflow: "hidden", marginBottom: "10px" }}>
          <Card
            style={{
              ...cardStyle,
              display: "flex",
              flexDirection: "column",
              height: "100%",
            }}
            title={header}
            styles={{ body: { flex: 1 } }}
          >
            {body}
          </Card>
        </div>
      </div>
    </EditableContext.Provider>
  );
}
