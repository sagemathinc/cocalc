import { Menu } from "antd";
import topMenu from "./top";
import sortMenu from "./sort";
import searchMenu from "./search";
//import groupMenu from "./group";
import hideFieldsMenu from "./hide-fields";
import limitMenu from "./limit";

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
    <Menu
      triggerSubMenuAction={"click"}
      mode="horizontal"
      items={[
        topMenu({ name, view }),
        hideFieldsMenu({
          columns,
          hiddenFields,
          setHiddenField,
          orderFields,
          setOrderFields,
          rowKey,
        }),
        searchMenu({ columns, search, setSearch, query }),
        //groupMenu({ columns }),
        sortMenu({
          columns,
          sortFields,
          setSortField,
        }),
        limitMenu({ limit, setLimit, setRecordHeight, recordHeight }),
      ]}
    />
  );
}
