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
  defaultSearch?: string;
  search?: string;
  style?: CSSProperties;
}

export default function IconSelect({
  onSelect,
  defaultSearch,
  search: search0,
  style,
}: Props) {
  const [search, setSearch] = useState<string>(search0 ?? defaultSearch ?? "");

  useEffect(() => {
    if (search0 != null) {
      setSearch(search0);
    }
  }, [search0]);

  return (
    <div style={style}>
      <Search
        placeholder="Search..."
        value={search}
        allowClear
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: "400px" }}
      />
      <div
        style={{
          marginTop: "10px",
          overflowY: "scroll",
          border: "1px solid lightgrey",
        }}
      >
        {icons(search, (name) => {
          setSearch(name);
          onSelect?.(name);
        })}
      </div>
    </div>
  );
}

function icons(search, onClick) {
  search = search.trim().toLowerCase();
  const v: JSX.Element[] = [];
  for (const name of iconNames) {
    if (!name.includes(search)) continue;
    v.push(<Match key={name} name={name} onClick={onClick} />);
  }
  return v;
}

function Match({
  name,
  onClick,
}: {
  name: IconName;
  onClick: (name: IconName) => void;
}) {
  return (
    <div
      style={{
        fontSize: "15px",
        display: "inline-block",
        width: "150px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      onClick={() => onClick(name)}
    >
      <span style={{ margin: "0 10px" }}>
        <Icon name={name} />
      </span>
      <span style={{ fontSize: "12px" }}>{name}</span>
    </div>
  );
}
