import { useMemo, useState } from "react";

// @ts-ignore
import { FilterOutlined } from "@ant-design/icons";

import type { MenuProps } from "antd";
import {
  Button,
  Divider,
  Input,
  InputNumber,
  Select,
  Space,
  Menu,
  Switch,
} from "antd";
import { TYPE_TO_ICON } from "./index";
import { Icon } from "@cocalc/frontend/components";
import useHiddenFields from "../syncdb/use-hidden-fields";
import useSortFields, {
  SortDirection,
  parseSort,
} from "../syncdb/use-sort-fields";
import useLimit from "../syncdb/use-limit";
import type { ColumnsType } from "../fields";

export default function ViewMenu({ name, view, columns, id }) {
  const [hiddenFields, setHiddenField] = useHiddenFields({ id });
  const [sortFields, setSortField] = useSortFields({ id });
  const [limit, setLimit] = useLimit({ id });
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
    {
      label:
        hiddenFields.size == 0 ? (
          "Hide fields"
        ) : (
          <span style={{ backgroundColor: "lightblue", padding: "5px" }}>
            Hide fields({hiddenFields.size})
          </span>
        ),
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
        disabled={allFields.length == hiddenFields.size}
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
        disabled={hiddenFields.size == 0}
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

interface SortByProps {
  columns: ColumnsType[];
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
          onClick={() => setSortField(sortField, sortField, null)}
        >
          <Icon name="times" />
        </Button>
      )}
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
