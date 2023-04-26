import { Tag } from "antd";
import { file_associations } from "@cocalc/frontend/file-associations";
import { Icon } from "@cocalc/frontend/components/icon";

const { CheckableTag } = Tag;

interface Props {
  tags: Set<string>;
  setTags: (tags: Set<string>) => void;
  minTags: number;
}

const TAGS = [
  { label: "Jupyter", ext: "ipynb" },
  { label: "Python", ext: "py" },
  { label: "R Stats", ext: "r" },
  { label: "SageMath", ext: "sage" },
  { label: "Linux", ext: "term" },
  { label: "LaTeX", ext: "tex" },
  { label: "C/C++", ext: "c" },
  { label: "Julia", ext: "jl" },
  { label: "Markdown", ext: "md" },
  { label: "Whiteboard", ext: "board" },
  { label: "Teach", ext: "course" },
  { label: "Chat", ext: "sage-chat" },
];

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
        What do you want to do right now? (Select at least {minTags})
        <div
          style={{
            marginTop: "5px",
            background: "white",
            borderRadius: "5px",
            padding: "10px",
          }}
        >
          {TAGS.map(({ label, ext }) => {
            return (
              <CheckableTag
                style={{ fontSize: "14px" }}
                key={ext}
                checked={tags.has(ext)}
                onChange={(checked) => {
                  handleTagChange(ext, checked);
                }}
              >
                <Icon
                  name={file_associations[ext]?.icon}
                  style={{ marginRight: "5px" }}
                />
                {label}
              </CheckableTag>
            );
          })}
        </div>
      </div>
    </>
  );
}
