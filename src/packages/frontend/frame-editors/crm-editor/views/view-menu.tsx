import { useMemo, useState } from "react";
import { FilterOutlined } from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Button, Divider, Input, Select, Space, Menu, Switch } from "antd";
import { TYPE_TO_ICON } from "./index";
import { Icon } from "@cocalc/frontend/components";
import useHiddenFields from "../syncdb/use-hidden-fields";
import useSortFields, { SortDirection } from "../syncdb/use-sort-fields";

export default function ViewMenu({ name, view, columns, id }) {
  const [hiddenFields, setHiddenField] = useHiddenFields({ id });
  const [sortFields, setSortField] = useSortFields({ id });
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
    {
      label: "Hide fields",
      key: "hide",
      icon: <Icon name="eye-slash" />,
      children: columns
        .map(({ dataIndex: field, title }) => {
          return {
            disabled: true,
            label: (
              <HideToggle
                title={title}
                hidden={hiddenFields.has(field)}
                onChange={(checked) => setHiddenField(field, !checked)}
              />
            ),
            key: `hide-field-name-${field}`,
          };
        })
        .concat([
          {
            disabled: true,
            label: (
              <HideShowAll
                hiddenFields={hiddenFields}
                setHiddenField={setHiddenField}
                allFields={allFields}
              />
            ),
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
      label:
        sortFields.length == 0 ? (
          "Sort"
        ) : (
          <span style={{ backgroundColor: "lightgreen", padding: "5px" }}>
            Sort ({sortFields.length})
          </span>
        ),
      key: "sort",
      icon: <Icon name="sort-amount-up" />,
      children: sortFields
        .map((field) => {
          return {
            disabled: true,
            label: (
              <SortBy
                columns={columns}
                field={field}
                setSortField={setSortField}
              />
            ),
            key: `sortby-${field}`,
          };
        })
        .concat(
          sortFields.length < columns.length
            ? [
                {
                  disabled: true,
                  label: (
                    <SortBy columns={columns} setSortField={setSortField} />
                  ),
                  key: "add",
                },
              ]
            : []
        ),
    },
  ];
}

function HideToggle({ title, hidden, onChange }) {
  return (
    <div style={{ width: "100%", color: "#666" }}>
      {title}
      <Switch
        style={{ float: "right", marginTop: "12px" }}
        size="small"
        checked={!hidden}
        onChange={onChange}
      />
    </div>
  );
}

function HideShowAll({ hiddenFields, setHiddenField, allFields }) {
  return (
    <Space>
      <Button
        onClick={() => {
          for (const field of allFields) {
            if (!hiddenFields.has(field)) {
              setHiddenField(field, true);
            }
          }
        }}
      >
        Hide All
      </Button>
      <Button
        onClick={() => {
          for (const field of hiddenFields) {
            setHiddenField(field, false);
          }
        }}
      >
        Show All
      </Button>
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

function parseSort(field?: string): {
  sortField: string;
  direction: SortDirection;
} {
  if (field?.[0] != "-") {
    return { sortField: field ?? "", direction: "ascending" };
  } else {
    return { sortField: field.slice(1), direction: "descending" };
  }
}

interface SortByProps {
  columns: any[];
  field?: string; // if not set, then adding
  setSortField: (
    field: string,
    newField: string,
    direction: SortDirection | null
  ) => void;
}

function SortBy({ columns, field, setSortField }: SortByProps) {
  const { sortField, direction } = useMemo(() => parseSort(field), [field]);
  return (
    <Space style={{ width: "100%" }}>
      <Select
        value={sortField}
        size="small"
        style={{ width: "200px" }}
        showSearch
        placeholder="Find a field..."
        filterOption={(input, option) =>
          ((option?.label ?? "") as string)
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        onChange={(newSortField: string) => {
          setSortField(sortField, newSortField, direction);
        }}
        optionFilterProp="children"
        options={columns.map(({ dataIndex, title }) => {
          return {
            value: dataIndex,
            label: title,
          };
        })}
      />
      {sortField && (
        <Select
          size="small"
          style={{ width: "150px" }}
          value={direction}
          onChange={(direction: SortDirection) => {
            setSortField(sortField, sortField, direction);
          }}
          options={[
            { value: "ascending" as SortDirection, label: "Ascending" },
            { value: "descending" as SortDirection, label: "Descending" },
          ]}
        />
      )}
      {sortField && (
        <Button
          style={{ float: "right" }}
          type="link"
          onClick={() => setSortField(sortField, "", null)}
        >
          <Icon name="times" />
        </Button>
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
