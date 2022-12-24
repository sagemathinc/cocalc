import { useMemo, useState } from "react";
import type { MenuProps } from "antd";
import { Select, Space, Menu } from "antd";
import topMenu from "./top";
import sortMenu from "./sort";
import searchMenu from "./search";
import hideFieldsMenu from "./hide-fields";
import limitMenu from "./limit";

export default function ViewMenu({
  name,
  view,
  columns,
  id,
  limit,
  setLimit,
  hiddenFields,
  setHiddenField,
  sortFields,
  setSortField,
}) {
  const items: MenuProps["items"] = useMemo(
    () =>
      getMenus({
        name,
        view,
        columns,
        hiddenFields,
        setHiddenField,
        sortFields,
        setSortField,
        limit,
        setLimit,
      }),
    [
      columns,
      view,
      name,
      id,
      hiddenFields,
      setHiddenField,
      sortFields,
      setSortField,
      limit,
      setLimit,
    ]
  );
  return (
    <Menu triggerSubMenuAction={"click"} mode="horizontal" items={items} />
  );
}

function getMenus({
  name,
  view,
  columns,
  hiddenFields,
  setHiddenField,
  sortFields,
  setSortField,
  limit,
  setLimit,
}) {
  const allFields = columns.map((x) => x.dataIndex);
  return [
    topMenu({ name, view }),
    hideFieldsMenu({
      hiddenFields,
      setHiddenField,
      allFields,
      columns,
    }),
    searchMenu({ columns }),
    //     {
    //       label: "Group",
    //       key: "group",
    //       icon: <Icon name="group" />,
    //       children: [
    //         {
    //           disabled: true,
    //           label: <GroupBy columns={columns} />,
    //           key: "groupby",
    //         },
    //       ],
    //     },
    sortMenu({
      sortFields,
      columns,
      setSortField,
    }),
    limitMenu({ limit, setLimit }),
  ];
}

// @ts-ignore
function GroupBy({ columns }) {
  const [field, setField] = useState<string>("");
  const [descending, setDescending] = useState<boolean>(false);
  return (
    <Space>
      <Select
        size="small"
        style={{ width: "200px" }}
        showSearch
        placeholder="Find a field..."
        filterOption={(input, option) =>
          ((option?.label ?? "") as string)
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        onChange={setField}
        optionFilterProp="children"
        options={columns.map(({ dataIndex, title }) => {
          return {
            value: dataIndex,
            label: title,
          };
        })}
      />
      {field && (
        <Select
          size="small"
          style={{ width: "150px" }}
          value={descending ? "descending" : "ascending"}
          onChange={(value) => {
            setDescending(value == "descending");
          }}
          options={[
            { value: "ascending", label: "Ascending" },
            { value: "descending", label: "Descending" },
          ]}
        />
      )}
    </Space>
  );
}
