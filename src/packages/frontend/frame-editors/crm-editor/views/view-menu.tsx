import { useState } from "react";
import { FilterOutlined } from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Button, Input, Select, Space, Menu, Switch } from "antd";
import { TYPE_TO_ICON } from "./index";
import { Icon } from "@cocalc/frontend/components";
import { fieldToLabel } from "../util";

export default function ViewMenu({ name, view }) {
  const items: MenuProps["items"] = [
    {
      label: name,
      key: "name",
      icon: <Icon name={TYPE_TO_ICON[view]} />,
      children: [
        {
          type: "group",
          children: [
            {
              label: "Rename view",
              key: "rename",
            },
            {
              label: "Edit view description",
              key: "description",
            },
          ],
        },
        {
          type: "group",
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
          children: [
            {
              label: "Download CSV",
              key: "csv",
            },
            {
              label: "Download JSON",
              key: "json",
            },
            {
              label: "Delete view",
              key: "delete",
            },
          ],
        },
      ],
    },
    {
      label: "Hide fields",
      key: "hide",
      icon: <Icon name="eye-slash" />,
      children: [
        {
          disabled: true,
          label: <HideToggle field="name" />,
          key: "name",
        },
        {
          disabled: true,
          label: <HideToggle field="email_address" />,
          key: "email_address",
        },
        {
          disabled: true,
          label: <HideToggle field="last_edited" />,
          key: "last_edited",
        },
        {
          disabled: true,
          label: <HideToggle field="tags" />,
          key: "tags",
        },
        {
          disabled: true,
          label: <HideShowAll />,
          key: "hide-show-all",
        },
      ],
    },
    {
      label: "Filter",
      key: "SubMenu",
      icon: <FilterOutlined />,
      children: [
        {
          disabled: true,
          label: <Filter field="name" />,
          key: "name",
        },
        {
          disabled: true,
          label: <Filter field="email_address" />,
          key: "email_address",
        },
        {
          disabled: true,
          label: <Filter field="last_edited" />,
          key: "last_edited",
        },
        {
          disabled: true,
          label: <Filter field="tags" />,
          key: "tags",
        },
        {
          disabled: true,
          label: <div style={{ height: "400px" }} />,
          key: "blank",
        },
      ],
    },
    {
      label: "Group",
      key: "group",
      icon: <Icon name="group" />,
      children: [
        {
          disabled: true,
          label: <GroupBy />,
          key: "groupby",
        },
        {
          type: "group",
          label: (
            <div
              style={{
                height: "400px",
              }}
            />
          ),
          key: "blank",
          children: [],
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
          label: <SortBy />,
          key: "sortby",
        },
        {
          type: "group",
          label: (
            <div
              style={{
                height: "400px",
              }}
            />
          ),
          key: "blank",
          children: [],
        },
      ],
    },
  ];

  return <Menu mode="horizontal" items={items} />;
}

function HideToggle({ field }) {
  return (
    <Space style={{ width: "100%", color: "#666" }}>
      <Switch size="small" defaultChecked /> {fieldToLabel(field)}
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

function Filter({ field }) {
  return (
    <Space style={{ width: "100%", color: "#666" }}>
      <div
        style={{
          overflowX: "auto",
          textOverflow: "ellipsis",
          width: "100px",
        }}
      >
        {fieldToLabel(field)}
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
      <Input size="small" style={{ width: "100%" }} />
    </Space>
  );
}

function SortBy({}) {
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
          (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
        }
        onChange={setField}
        optionFilterProp="children"
        options={[
          {
            value: "name",
            label: "Name",
          },
          {
            value: "email_address",
            label: "Email Address",
          },
          {
            value: "last_edited",
            label: "Last Edited",
          },
          {
            value: "tags",
            label: "Tags",
          },
        ]}
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

function GroupBy({}) {
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
          (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
        }
        onChange={setField}
        optionFilterProp="children"
        options={[
          {
            value: "name",
            label: "Name",
          },
          {
            value: "email_address",
            label: "Email Address",
          },
          {
            value: "last_edited",
            label: "Last Edited",
          },
          {
            value: "tags",
            label: "Tags",
          },
        ]}
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
