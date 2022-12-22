import { ReactNode, useEffect, useMemo } from "react";
import { Input } from "antd";
import { debounce } from "lodash";
import useFilter from "./filter-hook";
import useViewFilter from "../syncdb/use-view-filter";

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

  useEffect(
    debounce(() => {
      setFilter0(filter);
    }, 500),
    [filter]
  );

  const Filter = useMemo(
    () => (
      <Input.Search
        value={filter}
        allowClear
        placeholder="Filter View..."
        onSearch={setFilter}
        enterButton="Search"
        style={{ width: 300, marginBottom: "5px" }}
        onChange={(e) => setFilter(e.target.value)}
      />
    ),
    [id, filter]
  );

  return { filteredData, Filter, numHidden };
}
