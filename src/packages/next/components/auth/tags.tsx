import { Button, Tag } from "antd";
import { file_associations } from "@cocalc/frontend/file-associations";
import { Icon } from "@cocalc/frontend/components/icon";
import { TAGS } from "@cocalc/util/db-schema/accounts";

const { CheckableTag } = Tag;

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
    <div style={{ minWidth: "475px", textAlign:'center', ...style }}>
      What do you want to use right now (at least {minTags})?
      <div
        style={{
          marginTop: "5px",
          background: "white",
          borderRadius: "5px",
          padding: "10px",
        }}
      >
        {TAGS.map(({ label, tag, icon }) => {
          const iconName = icon ?? file_associations[tag]?.icon;
          return (
            <CheckableTag
              style={{ fontSize: "14px", width: "105px" }}
              key={tag}
              checked={tags.has(tag)}
              onChange={(checked) => {
                handleTagChange(tag, checked);
              }}
            >
              {iconName && (
                <Icon name={iconName} style={{ marginRight: "5px" }} />
              )}
              {label}
            </CheckableTag>
          );
        })}
        <Button
          style={{ float: "right", marginRight: "10px", marginTop: "5px" }}
          size="small"
          onClick={() => {
            if (tags.size == TAGS.length) {
              setTags(new Set([]));
            } else {
              setTags(new Set(TAGS.map((x) => x.tag)));
            }
          }}
        >
          <Icon name="atom" />
          Everything!
        </Button>
      </div>
    </div>
  );
}
