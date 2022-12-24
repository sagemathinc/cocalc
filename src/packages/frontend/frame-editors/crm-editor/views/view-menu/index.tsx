import { Menu } from "antd";
import topMenu from "./top";
import sortMenu from "./sort";
import searchMenu from "./search";
//import groupMenu from "./group";
import hideFieldsMenu from "./hide-fields";
import limitMenu from "./limit";

export default function ViewMenu({
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
        }),
        searchMenu({ columns, search, setSearch }),
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
