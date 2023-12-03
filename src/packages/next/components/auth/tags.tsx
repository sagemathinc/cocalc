import { Tag } from "antd";
import { file_associations } from "@cocalc/frontend/file-associations";
import { Icon } from "@cocalc/frontend/components/icon";
import { TAGS } from "@cocalc/util/db-schema/accounts";

interface Props {
  tags: Set<string>;
  setTags: (tags: Set<string>) => void;
  minTags: number;
  style?;
}

export default function Tags({ tags, setTags, minTags, style }: Props) {
  const handleTagChange = (tag: string, checked: boolean) => {
    if (checked) {
      tags.add(tag);
    } else {
      tags.delete(tag);
    }
    setTags(new Set(tags));
  };

  return (
    <div style={style}>
      <div style={{ textAlign: "center" }}>Select at least {minTags}</div>
      <div
        style={{
          marginTop: "5px",
          background: "white",
          borderRadius: "5px",
          padding: "10px",
        }}
      >
        {TAGS.map(({ label, tag, icon, color }) => {
          const iconName = icon ?? file_associations[tag]?.icon;
          return (
            <Tag
              style={{
                fontSize: "14px",
                width: "105px",
                cursor: "pointer",
                ...(tags.has(tag)
                  ? { color: "white", background: "#1677ff" }
                  : undefined),
              }}
              key={tag}
              onClick={() => {
                handleTagChange(tag, !tags.has(tag));
              }}
              color={tags.has(tag) ? undefined : color}
            >
              {iconName && (
                <Icon name={iconName} style={{ marginRight: "5px" }} />
              )}
              {label}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
