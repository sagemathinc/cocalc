import { useMemo } from "react";
import { SortDirection, parseSort } from "../../syncdb/use-sort-fields";
import type { ColumnsType } from "../../fields";
import { Button, Select, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { plural } from "@cocalc/util/misc";

export default function sortMenu({ sortFields, columns, setSortField }) {
  return {
    label:
      sortFields.length == 0 ? (
        "Sort"
      ) : (
        <span style={{ backgroundColor: "orange", padding: "5px" }}>
          {sortFields.length} Sort {plural(sortFields.length, "Field")}
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
                label: <SortBy columns={columns} setSortField={setSortField} />,
                key: "sortby-add",
              },
            ]
          : []
      ),
  };
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
