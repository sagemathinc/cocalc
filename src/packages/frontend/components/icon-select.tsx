/* Search through and select icons

See frontend/components/iconfont.cn/README.md for how to add anything from
the massive https://www.iconfont.cn/?lang=us
*/

import { Input } from "antd";
import { Icon, iconNames, IconName } from "./icon";
import { CSSProperties, useEffect, useState } from "react";
const { Search } = Input;

interface Props {
  onSelect?: (name: IconName) => void;
  onChange?: (search: string) => void;
  defaultSearch?: string;
  search?: string;
  style?: CSSProperties;
  fontSize?: string;
  disabled?: boolean;
}

export default function IconSelect({
  onSelect,
  onChange,
  defaultSearch,
  search: search0,
  style,
  fontSize,
  disabled,
}: Props) {
  const [search, setSearch] = useState<string>(search0 ?? defaultSearch ?? "");

  useEffect(() => {
    if (search0 != null) {
      setSearch(search0);
    }
  }, [search0]);

  return (
    <div style={{ fontSize: "24pt", ...style }}>
      <Search
        disabled={disabled}
        placeholder="Search..."
        value={search}
        allowClear
        onChange={(e) => {
          setSearch(e.target.value);
          onChange?.(e.target.value);
        }}
        style={{ maxWidth: "400px" }}
        onPressEnter={() => {
          // if there are any results, choose the first one
          const search0 = search.trim().toLowerCase();
          for (const name of iconNames) {
            if (name.includes(search0)) {
              setSearch(name);
              onChange?.(name);
              onSelect?.(name);
              return;
            }
          }
        }}
      />
      <div
        style={{
          marginTop: "10px",
          overflowY: "scroll",
          border: "1px solid lightgrey",
        }}
      >
        {icons(search, fontSize, (name) => {
          setSearch(name);
          onSelect?.(name);
        })}
      </div>
    </div>
  );
}

function icons(search, fontSize, onClick) {
  search = search.trim().toLowerCase();
  const v: React.JSX.Element[] = [];
  for (const name of iconNames) {
    if (!name.includes(search)) continue;
    v.push(
      <Match fontSize={fontSize} key={name} name={name} onClick={onClick} />
    );
  }
  return v;
}

function Match({
  name,
  onClick,
  fontSize = "11pt",
}: {
  name: IconName;
  onClick: (name: IconName) => void;
  fontSize?;
}) {
  return (
    <div
      style={{
        display: "inline-block",
        width: "100px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        textAlign: "center",
      }}
      onClick={() => onClick(name)}
    >
      <div style={{ margin: "0 10px" }}>
        <Icon name={name} />
      </div>
      <div style={{ fontSize }}>{name}</div>
    </div>
  );
}
