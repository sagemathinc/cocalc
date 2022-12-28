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
}) {
  return (
    <Menu
      triggerSubMenuAction={"click"}
      mode="horizontal"
      items={[
        topMenu({ name, view, setRecordHeight, recordHeight }),
        hideFieldsMenu({
          columns,
          hiddenFields,
          setHiddenField,
        }),
        searchMenu({ columns, search, setSearch, query }),
        //groupMenu({ columns }),
        sortMenu({
          columns,
          sortFields,
          setSortField,
        }),
        limitMenu({ limit, setLimit }),
      ]}
    />
  );
}
