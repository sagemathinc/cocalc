import { ReactNode, useEffect, useMemo } from "react";
import { Input } from "antd";
import { debounce } from "lodash";
import useFilter from "./filter-hook";
import useViewFilter from "../syncdb/use-view-filter";
import { plural } from "@cocalc/util/misc";

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
