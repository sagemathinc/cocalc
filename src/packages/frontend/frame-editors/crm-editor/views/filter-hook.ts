import { useMemo, useState } from "react";
import { search_match, search_split } from "@cocalc/util/misc";
import { useTags } from "../querydb/tags";

export default function useFilter({
  data,
  defaultFilter,
}: {
  data: any[];
  defaultFilter?: string;
}): {
  filteredData: any[];
  setFilter: (string) => void;
  numHidden: number;
} {
  const tags = useTags();
  const [filter, setFilter] = useState<string>(defaultFilter ?? "");
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
      if (search_match(toSearch(x, tags), searchTerms)) {
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

function toSearch(obj, tags) {
  if (tags != null && obj["tags"] != null) {
    obj = { ...obj, tags: toStrings(obj["tags"], tags) };
  }
  return JSON.stringify(obj).toLowerCase().replace(/"|'\s/g, "");
}

function toStrings(tagList: number[], tags) {
  return tagList.map((id) => `#${tags[id]?.name ?? "..."}`);
}
