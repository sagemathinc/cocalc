import { useMemo, useState } from "react";

// @ts-ignore
import { FilterOutlined } from "@ant-design/icons";

import type { MenuProps } from "antd";
import { Divider, Input, InputNumber, Select, Space, Menu } from "antd";
import { TYPE_TO_ICON } from "./index";
import { Icon } from "@cocalc/frontend/components";
import sortMenu from "./sort-menu";
import hideFieldsMenu from "./hide-fields-menu";

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
    {
      label: name,
      key: "top-menu",
      icon: <Icon name={TYPE_TO_ICON[view]} />,
      children: [
        {
          type: "group",
          label: <Divider>Edit</Divider>,
          children: [
            {
              label: "Rename view",
              key: "rename",
            },
            {
              label: "Edit view description",
              key: "description",
            },
            {
              danger: true,
              label: "Delete view",
              key: "delete",
            },
          ],
        },
        {
          type: "group",
          label: <Divider>Other</Divider>,
          children: [
            {
              label: "Duplicate view",
              key: "duplicate",
            },
            {
              label: "Copy another view's configuration",
              key: "copy",
            },
          ],
        },
        {
          type: "group",
          label: <Divider>Download</Divider>,
          children: [
            {
              label: "Download CSV",
              key: "csv",
            },
            {
              label: "Download JSON",
              key: "json",
            },
          ],
        },
      ],
    },
    hideFieldsMenu({
      hiddenFields,
      setHiddenField,
      allFields,
      columns,
    }),
    //     {
    //       label: "Search",
    //       key: "SubMenu",
    //       icon: <FilterOutlined />,
    //       children: columns.map(({ dataIndex, title }) => {
    //         return {
    //           disabled: true,
    //           label: <Filter field={dataIndex} title={title} />,
    //           key: `filter-name-${dataIndex}`,
    //         };
    //       }),
    //     },
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
    {
      label: <span style={{ padding: "5px" }}>Limit ({limit})</span>,
      key: "limit",
      icon: <Icon name="database" />,
      children: [
        {
          disabled: true,
          label: <Limit limit={limit} setLimit={setLimit} />,
          key: "the-limit",
        },
      ],
    },
  ];
}

// @ts-ignore
function Filter({ field, title }) {
  return (
    <Space style={{ width: "100%", color: "#666" }}>
      <div
        style={{
          overflowX: "auto",
          textOverflow: "ellipsis",
          width: "100px",
        }}
      >
        {title}
      </div>
      <Select
        size="small"
        defaultValue="contains"
        style={{ width: "150px" }}
        options={[
          {
            value: "contains",
            label: "contains",
          },
          {
            value: "does not contain",
            label: "does not contain",
          },
          {
            value: "is",
            label: "is",
          },
          {
            value: "is not",
            label: "is not",
          },
        ]}
      />
      <Input
        size="small"
        style={{ width: "100%" }}
        onChange={() => {
          console.log("change filter for ", field);
        }}
      />
    </Space>
  );
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

function Limit({ limit, setLimit }) {
  return (
    <Space>
      <div style={{ color: "#666" }}>Limit on number of results:</div>
      <InputNumber
        style={{ marginBottom: "7.5px" /* ugly hack */ }}
        min={1}
        max={1000}
        step={25}
        defaultValue={limit}
        onChange={(value) => {
          if (value) {
            setLimit(value);
          }
        }}
      />
    </Space>
  );
}
