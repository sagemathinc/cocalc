import { useMemo, useState } from "react";
import { FilterOutlined } from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Button, Divider, Input, Select, Space, Menu, Switch } from "antd";
import { TYPE_TO_ICON } from "./index";
import { Icon } from "@cocalc/frontend/components";

export default function ViewMenu({ name, view, columns }) {
  const items: MenuProps["items"] = useMemo(
    () => getMenus({ name, view, columns }),
    [columns, view, name]
  );
  return (
    <Menu triggerSubMenuAction={"click"} mode="horizontal" items={items} />
  );
}

function getMenus({ name, view, columns }) {
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
    {
      label: "Hide fields",
      key: "hide",
      icon: <Icon name="eye-slash" />,
      children: columns
        .map(({ dataIndex, title }) => {
          return {
            disabled: true,
            label: <HideToggle field={dataIndex} title={title} />,
            key: `hide-field-name-${dataIndex}`,
          };
        })
        .concat([
          {
            disabled: true,
            label: <HideShowAll />,
            key: "hide-show-all",
          },
        ]),
    },
    {
      label: "Search",
      key: "SubMenu",
      icon: <FilterOutlined />,
      children: columns.map(({ dataIndex, title }) => {
        return {
          disabled: true,
          label: <Filter field={dataIndex} title={title} />,
          key: `filter-name-${dataIndex}`,
        };
      }),
    },
    {
      label: "Group",
      key: "group",
      icon: <Icon name="group" />,
      children: [
        {
          disabled: true,
          label: <GroupBy columns={columns} />,
          key: "groupby",
        },
      ],
    },
    {
      label: "Sort",
      key: "sort",
      icon: <Icon name="sort-amount-up" />,
      children: [
        {
          disabled: true,
          label: <SortBy columns={columns} />,
          key: "sortby",
        },
      ],
    },
  ];
}

function HideToggle({ field, title }) {
  return (
    <Space style={{ width: "100%", color: "#666" }}>
      <Switch
        size="small"
        defaultChecked
        onChange={() => {
          console.log("toggle", field);
        }}
      />{" "}
      {title}
    </Space>
  );
}

function HideShowAll() {
  return (
    <Space>
      <Button>Hide All</Button>
      <Button>Show All</Button>
    </Space>
  );
}

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

function SortBy({ columns }) {
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
