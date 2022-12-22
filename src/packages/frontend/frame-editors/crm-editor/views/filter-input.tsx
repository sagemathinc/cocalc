import { FC, useMemo, useRef, useEffect } from "react";
import { Input } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { debounce } from "lodash";
import useFilter from "./filter-hook";

export default function useFilterInput({ data, id }): {
  filteredData: any[];
  Filter: FC<any>;
  numHidden: number;
} {
  const { actions, id: frameId, desc } = useFrameContext();
  const filterKey = useMemo(() => {
    return `data-view-${id}-filter`;
  }, [id]);

  const {
    filteredData,
    setFilter: setFilter0,
    numHidden,
  } = useFilter({ data });

  const filterRef = useRef<any>(null);

  const setFilter = useMemo(() => {
    return (filter: string) => {
      setFilter0(filter);
      actions.set_frame_tree({ id: frameId, [filterKey]: filter });
    };
  }, [setFilter0, filterKey]);

  useEffect(() => {
    // type of desc.get is not known.
    const filter = `${desc.get(filterKey) ?? ""}`;
    setFilter(filter);
    if (filterRef.current != null) {
      filterRef.current.value = filter;
    }
  }, [filterKey]);

  const Filter = useMemo(
    () => (props) =>
      (
        <Input.Search
          ref={filterRef}
          defaultValue={desc.get(filterKey) ?? ""}
          allowClear
          placeholder="Filter View..."
          onSearch={setFilter}
          enterButton="Search"
          style={{ width: 300, marginBottom: "5px" }}
          onChange={debounce((e) => setFilter(e.target.value), 500)}
          {...props}
        />
      ),
    [filterKey]
  );

  return { filteredData, Filter, numHidden };
}
