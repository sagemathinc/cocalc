import { Space } from "antd";
import topMenu from "./top";
import sortMenu from "./sort";
import SearchMenu from "./search";
//import groupMenu from "./group";
import HideFieldsMenu from "./hide-fields";
import LimitsMenu from "./limits";

export default function ViewMenu({
  query,
  name,
  view,
  columns,
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
}) {
  return (
    <Space direction="horizontal">
      <HideFieldsMenu
        columns={columns}
        hiddenFields={hiddenFields}
        setHiddenField={setHiddenField}
        orderFields={orderFields}
        setOrderFields={setOrderFields}
        rowKey={rowKey}
      />
      <SearchMenu
        columns={columns}
        search={search}
        setSearch={setSearch}
        query={query}
      />
      <LimitsMenu
        limit={limit}
        setLimit={setLimit}
        setRecordHeight={setRecordHeight}
        recordHeight={recordHeight}
      />
    </Space>
  );

  /*
  return (
    <Menu
      triggerSubMenuAction={"click"}
      mode="horizontal"
      items={[
        topMenu({ name, view }),
        searchMenu({ columns, search, setSearch, query }),
        //groupMenu({ columns }),
        sortMenu({
          columns,
          sortFields,
          setSortField,
        }),
      ]}
    />
  );
  */
}
