import { ReactNode, useMemo } from "react";
import { Input } from "antd";
import useFilter from "./filter-hook";
import useViewFilter from "../syncdb/use-view-filter";
import { plural } from "@cocalc/util/misc";
import useDebounceEffect from "@cocalc/frontend/app-framework/use-debounce-effect";

export default function useFilterInput({ data, id }): {
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

  const Filter = useMemo(
    () => (
      <Input.Search
        value={filter}
        allowClear
        placeholder={`Filter ${data.length} ${plural(
          data.length,
          "Result"
        )}...`}
        onSearch={setFilter}
        enterButton="Filter"
        style={{ width: 300, marginBottom: "5px" }}
        onChange={(e) => setFilter(e.target.value)}
      />
    ),
    [id, filter, data.length]
  );

  return { filteredData, Filter, numHidden };
}
