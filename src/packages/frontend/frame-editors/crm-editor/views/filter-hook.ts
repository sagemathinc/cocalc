import { useMemo, useState } from "react";
import { search_match, search_split } from "@cocalc/util/misc";

export default function useFilter({ data }: { data: any[] }): {
  filteredData: any[];
  setFilter: (string) => void;
  numHidden: number;
} {
  const [filter, setFilter] = useState<string>("");
  const searchTerms = useMemo(() => {
    return search_split(filter);
  }, [filter]);

  const filteredData = useMemo(() => {
    if (!filter.trim()) {
      return data;
    }
    // stupid for initial testing
    const v: any[] = [];
    for (const x of data) {
      if (search_match(toSearch(x), searchTerms)) {
        v.push(x);
      }
    }
    return v;
  }, [data, searchTerms]);

  return {
    filteredData,
    setFilter,
    numHidden: data.length - filteredData.length,
  };
}

function toSearch(obj) {
  return JSON.stringify(obj).toLowerCase().replace(/"|'\s/g, "");
}
