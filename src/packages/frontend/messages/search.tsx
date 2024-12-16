import { Input } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "lodash";

export default function Search({ filter }) {
  const [value, setValue] = useState<string>("");
  const search = useMemo(() => {
    return debounce(
      (query) => {
        const actions = redux.getActions("messages");
        actions?.search(query);
      },
      250,
      {
        // leading=false, since as soon as you stop your burst of typing,
        // the index gets built which blocks CPU until done
        leading: false,
        trailing: true,
      },
    );
  }, []);

  useEffect(() => {
    // reset on mount
    search("");
  }, []);

  const inputRef = useRef<any>(null);

  useEffect(() => {
    // changing the filter to anything other than messages-search
    // clears the search.
    if (filter != "messages-search") {
      search("");
      setValue("");
    } else {
      inputRef.current?.focus();
    }
  }, [filter]);

  return (
    <Input.Search
      ref={inputRef}
      value={value}
      style={{ marginBottom: "10px" }}
      size="large"
      allowClear
      enterButton
      placeholder="Search messages..."
      onSearch={() => search(value)}
      onChange={(e) => {
        setValue(e.target.value);
        search(e.target.value);
      }}
    />
  );
}
