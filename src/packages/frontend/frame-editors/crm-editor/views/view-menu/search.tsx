import { Button, Input, InputNumber, Popover, Select, Space } from "antd";
import { useMemo } from "react";

import { FilterOutlined } from "@ant-design/icons";
import { Icon } from "@cocalc/frontend/components";
import { OPERATORS } from "@cocalc/util/db-schema";
import { capitalize } from "@cocalc/util/misc";
import type { ColumnsType } from "../../fields";
import { getFieldSpec } from "../../fields";
import { AtomicSearch, Operator } from "../../syncdb/use-search";
import TimeValue from "./time-value";

function enumerate(x: object[]): any[] {
  const v: object[] = [];
  for (let n = 0; n < x.length; n++) {
    v.push({ ...x[n], n });
  }
  return v;
}

const IS_NOT_IS = [
  { value: "IS" as Operator, label: "IS" },
  { value: "IS NOT" as Operator, label: "IS NOT" },
] as const;

export default function SearchMenu({ columns, search, setSearch, query }) {
  const dbtable = Object.keys(query)[0] as string;

  const content = enumerate(search)
    .map(({ n, field, operator, value }) => (
      <SearchBy
        key={`search-${n}`}
        dbtable={dbtable}
        field={field}
        operator={operator}
        value={value}
        columns={columns}
        setSearch={setSearch}
        n={n}
      />
    ))
    .concat([
      <SearchBy
        key={"search-add"}
        dbtable={dbtable}
        n={search.length}
        columns={columns}
        setSearch={setSearch}
      />,
    ]);

  const label = search.length == 0 ? "Search" : `Search (${search.length})`;

  return (
    <Popover
      placement="bottom"
      overlayInnerStyle={{
        maxHeight: "90vh",
        maxWidth: "750px",
        overflow: "auto",
      }}
      content={<div>{content}</div>}
      trigger="click"
    >
      <Button
        type="text"
        style={{
          backgroundColor: search.length > 0 ? "lightgreen" : undefined,
        }}
      >
        <FilterOutlined />
        {label}
      </Button>
    </Popover>
  );
}

interface SearchByProps {
  dbtable: string;
  field?: string; // if not set, then adding
  operator?: Operator;
  value?: string;
  columns: ColumnsType[];
  setSearch: (n: number, search: AtomicSearch | null) => void;
  n: number;
}

function SearchBy({
  dbtable,
  columns,
  field,
  operator,
  value,
  setSearch,
  n,
}: SearchByProps) {
  const fieldSpec = useMemo(
    () => (field ? getFieldSpec(dbtable, field) : {}),
    [dbtable, field],
  );

  return (
    <Space style={{ width: "100%", marginBottom: "5px" }}>
      <Select
        value={field ?? ""}
        style={{ width: "150px" }}
        showSearch
        placeholder="Find a field..."
        filterOption={(input, option) =>
          ((option?.label ?? "") as string)
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        onChange={(newField: string) => {
          setSearch(n, { field: newField, operator, value });
        }}
        optionFilterProp="children"
        options={columns.map(({ dataIndex, title }) => {
          return {
            value: dataIndex,
            label: title,
          };
        })}
      />
      {field && (
        <SelectOperator
          fieldSpec={fieldSpec}
          operator={operator}
          onChange={(operator) => {
            setSearch(n, { field, operator, value });
          }}
        />
      )}
      {field && operator && (
        <Value
          fieldSpec={fieldSpec}
          operator={operator}
          value={value}
          onChange={(value) => {
            setSearch(n, { field, operator, value });
          }}
        />
      )}
      <Button
        style={{ float: "right" }}
        type="link"
        onClick={() => setSearch(n, null)}
      >
        <Icon name="times" />
      </Button>
      {field && value && operator && (
        <Icon name="check" style={{ color: "green" }} />
      )}
    </Space>
  );
}

function SelectOperator({ fieldSpec, operator, onChange }) {
  const options = useMemo(() => {
    if (fieldSpec.type === "boolean") {
      return [...IS_NOT_IS];
    }
    if (fieldSpec.type === "array") {
      return [
        { value: "ANY" as Operator, label: "ANY" },
        { value: "MINLEN" as Operator, label: ">=LEN" },
        { value: "MAXLEN" as Operator, label: "<=LEN" },
        ...IS_NOT_IS,
      ];
    }
    return OPERATORS.filter(
      (op) => op !== "==" && op !== "ANY" && op !== "MINLEN" && op !== "MAXLEN",
    ).map((op: Operator) => {
      return { value: op, label: op };
    });
  }, [fieldSpec]);
  return (
    <Select
      style={{ width: "150px" }}
      value={operator}
      onChange={onChange}
      options={options}
    />
  );
}

// For field spec meaning, see packages/util/db-schema/types.ts
function Value({ fieldSpec, operator, value, onChange }) {
  if (fieldSpec.type == "boolean") {
    return (
      <Select
        style={{ width: "100px" }}
        value={value}
        onChange={onChange}
        options={[
          { label: "True", value: "true" },
          { label: "False", value: "false" },
          { label: "NULL", value: "NULL" },
        ]}
      />
    );
  }
  if (operator == "IS" || operator == "IS NOT") {
    // not boolean, since that was handled above.
    return (
      <Select
        style={{ width: "100px" }}
        value={value}
        onChange={onChange}
        options={[{ label: "NULL", value: "NULL" }]}
      />
    );
  }
  if (fieldSpec.type == "timestamp") {
    return <TimeValue value={value} onChange={onChange} />;
  } else if (fieldSpec.type == "number" || fieldSpec.type == "integer") {
    return (
      <InputNumber
        style={{ width: "100px" }}
        value={value}
        onChange={onChange}
        step={1}
      />
    );
  } else if (fieldSpec.type == "string" && fieldSpec.render?.type == "select") {
    return (
      <Select
        style={{ width: "100px" }}
        value={value}
        onChange={onChange}
        options={fieldSpec.render.options.map((value) => {
          return {
            label: capitalize(value),
            value,
          };
        })}
      />
    );
  } else {
    return (
      <Input
        style={{ width: "150px" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
}
