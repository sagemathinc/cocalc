import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Space } from "antd";
import TopMenu from "./top";
import SortMenu from "./sort";
import SearchMenu from "./search";
//import GroupMenu from "./group";
import HideFieldsMenu from "./hide-fields";
import LimitsMenu from "./limits";
import NewMenu from "./new";

export default function ViewMenu({
  id,
  query,
  name,
  title,
  table,
  dbtable,
  view,
  data,
  viewCount,
  tableLowerBound,
  columns,
  allColumns,
  limit,
  setLimit,
  hiddenFields,
  setHiddenField,
  sortFields,
  setSortField,
  search,
  setSearch,
  setRecordHeight,
  recordHeight,
  orderFields,
  setOrderFields,
  rowKey,
  primaryKey,
  addNew,
  addedRecords,
  setAddedRecords,
  refresh,
  filters,
}) {
  return (
    <Space
      direction="horizontal"
      wrap
      style={{ maxHeight: "135px", overflowY: "auto" }}
    >
      <TopMenu
        id={id}
        name={name}
        dbtable={dbtable}
        view={view}
        viewCount={viewCount}
        tableLowerBound={tableLowerBound}
        data={data}
        title={title}
        primaryKey={primaryKey}
        columns={columns}
        refresh={refresh}
      />
      <HideFieldsMenu
        columns={allColumns}
        hiddenFields={hiddenFields}
        setHiddenField={setHiddenField}
        orderFields={orderFields}
        setOrderFields={setOrderFields}
        rowKey={rowKey}
      />
      <SearchMenu
        columns={allColumns}
        search={search}
        setSearch={setSearch}
        query={query}
      />
      {/* <GroupMenu columns={allColumns} /> */}
      <SortMenu
        columns={allColumns}
        sortFields={sortFields}
        setSortField={setSortField}
      />
      <LimitsMenu
        limit={limit}
        setLimit={setLimit}
        setRecordHeight={setRecordHeight}
        recordHeight={recordHeight}
      />
      {addNew && (
        <NewMenu
          addedRecords={addedRecords}
          setAddedRecords={setAddedRecords}
          addNew={addNew}
          title={title}
          table={table}
        />
      )}
      <Button type="text" onClick={refresh}>
        <Icon name="refresh" /> Reload
      </Button>
      {filters}
    </Space>
  );
}
