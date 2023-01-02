import { useMemo } from "react";
import { SortDirection, parseSort } from "../../syncdb/use-sort-fields";
import type { ColumnsType } from "../../fields";
import { Button, Popover, Select, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";

export default function SortMenu({ sortFields, columns, setSortField }) {
  const content = (
    <div>
      {sortFields
        .map((field) => (
          <SortBy
            key={`sortby-${field}`}
            columns={columns}
            field={field}
            setSortField={setSortField}
          />
        ))
        .concat(
          sortFields.length < columns.length
            ? [
                <SortBy
                  key="sortby-add"
                  columns={columns}
                  setSortField={setSortField}
                />,
              ]
            : []
        )}
    </div>
  );

  const label = sortFields.length == 0 ? "Sort" : `Sort (${sortFields.length})`;

  return (
    <Popover
      placement="bottom"
      overlayInnerStyle={{
        maxHeight: "90vh",
        maxWidth: "375px",
        overflow: "auto",
      }}
      content={<div>{content}</div>}
      trigger="click"
    >
      <Button
        type="text"
        style={{
          backgroundColor: sortFields.length > 0 ? "orange" : undefined,
        }}
      >
        <Icon name="sort-amount-up" />
        {label}
      </Button>
    </Popover>
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
        style={{ width: "150px" }}
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
