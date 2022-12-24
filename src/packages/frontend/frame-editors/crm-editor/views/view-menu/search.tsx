import { FilterOutlined } from "@ant-design/icons";
import { Button, Input, Select, Space } from "antd";
import type { ColumnsType } from "../../fields";
import { Icon } from "@cocalc/frontend/components";
import { plural } from "@cocalc/util/misc";
import { Operator, OPERATORS, AtomicSearch } from "../../syncdb/use-search";

function enumerate(x: object[]): any[] {
  const v: object[] = [];
  for (let n = 0; n < x.length; n++) {
    v.push({ ...x[n], n });
  }
  return v;
}

export default function searchMenu({ columns, search, setSearch }) {
  return {
    label:
      search.length == 0 ? (
        "Search"
      ) : (
        <span style={{ backgroundColor: "lightgreen", padding: "5px" }}>
          {search.length} Search {plural(search.length, "Field")}
        </span>
      ),
    key: "SubMenu",
    icon: <FilterOutlined />,
    children: enumerate(search)
      .map(({ n, field, operator, value }) => {
        return {
          disabled: true,
          label: (
            <SearchBy
              field={field}
              operator={operator}
              value={value}
              columns={columns}
              setSearch={setSearch}
              n={n}
            />
          ),
          key: `search-${n}`,
        };
      })
      .concat([
        {
          disabled: true,
          label: (
            <SearchBy
              n={search.length}
              columns={columns}
              setSearch={setSearch}
            />
          ),
          key: "search-add",
        },
      ]),
  };
}

interface SearchByProps {
  field?: string; // if not set, then adding
  operator?: Operator;
  value?: string;
  columns: ColumnsType[];
  setSearch: (n: number, search: AtomicSearch | null) => void;
  n: number;
}

function SearchBy({
  columns,
  field,
  operator,
  value,
  setSearch,
  n,
}: SearchByProps) {
  return (
    <Space style={{ width: "100%" }}>
      <Select
        value={field ?? ""}
        size="small"
        style={{ width: "200px" }}
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
        <Select
          size="small"
          style={{ width: "150px" }}
          value={operator}
          onChange={(operator: Operator) => {
            setSearch(n, { field, operator, value });
          }}
          options={OPERATORS.map((op: Operator) => {
            return { value: op, label: op };
          })}
        />
      )}
      {field && operator && (
        <Input
          size="small"
          style={{ width: "150px" }}
          value={value}
          onChange={(e) => {
            setSearch(n, { field, operator, value: e.target.value });
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
    </Space>
  );
}
