import { ReactNode, useMemo } from "react";
import { Input } from "antd";
import useFilter from "./filter-hook";
import useViewFilter from "../syncdb/use-view-filter";
import { plural } from "@cocalc/util/misc";
import useDebounceEffect from "@cocalc/frontend/app-framework/use-debounce-effect";
import { FilterOutlined } from "@ant-design/icons";

export default function useFilterInput({ data, id, title }): {
  filteredData: any[];
  Filter: ReactNode;
  numHidden: number;
} {
  const [filter, setFilter] = useViewFilter({ id });

  const {
    filteredData,
    setFilter: setFilter0,
    numHidden,
  } = useFilter({ data, defaultFilter: filter });

  useDebounceEffect<[filter: string, setFilter0: Function]>(
    {
      func: ([filter]) => setFilter0(filter),
      wait: 500,
      options: { leading: true, trailing: true },
    },
    [filter, setFilter0]
  );

  const Filter = useMemo(() => {
    return (
      <Input.Search
        value={filter}
        allowClear
        onSearch={setFilter}
        placeholder={`Filter ${data.length} ${plural(
          data.length,
          "Result"
        )}...`}
        enterButton={
          <div
            style={{
              maxWidth: "125px",
              overflow: "auto",
              textOverflow: "ellipsis",
            }}
          >
            <FilterOutlined /> {title}
          </div>
        }
        style={{ width: 250, marginBottom: "5px" }}
        onChange={(e) => setFilter(e.target.value)}
      />
    );
  }, [id, filter, data.length]);

  return { filteredData, Filter, numHidden };
}
