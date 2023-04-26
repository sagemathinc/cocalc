import { Tag } from "antd";
import { file_associations } from "@cocalc/frontend/file-associations";
import { Icon } from "@cocalc/frontend/components/icon";
import { TAGS } from "@cocalc/util/db-schema/accounts";

const { CheckableTag } = Tag;

interface Props {
  tags: Set<string>;
  setTags: (tags: Set<string>) => void;
  minTags: number;
}

export default function Tags({ tags, setTags, minTags }: Props) {
  const handleTagChange = (tag: string, checked: boolean) => {
    if (checked) {
      tags.add(tag);
    } else {
      tags.delete(tag);
    }
    setTags(new Set(tags));
  };

  return (
    <>
      <div>
        What do you want to do right now (at least {minTags})?
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
                style={{ fontSize: "14px", width: "100px" }}
                key={tag}
                checked={tags.has(tag)}
                onChange={(checked) => {
                  handleTagChange(tag, checked);
                }}
              >
                {iconName ?? (
                  <Icon name={iconName} style={{ marginRight: "5px" }} />
                )}
                {label}
              </CheckableTag>
            );
          })}
        </div>
      </div>
    </>
  );
}
