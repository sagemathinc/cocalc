import getTitle from "./get-title";
import { Spin, Tag, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

interface Props {
  id: number;
  style?;
  title?; // used for tooltip
}

export default function ComputeServerTag({ id, style, title }: Props) {
  const [desc, setDesc] = useState<{ title: string; color: string } | null>(
    null,
  );
  useEffect(() => {
    (async () => {
      setDesc(await getTitle(id));
    })();
  }, []);
  if (desc == null) {
    return <Spin delay={3000} />;
  }
  return (
    <Tooltip title={title ?? <>Compute server "{desc.title}"</>}>
      <Tag
        style={{
          color: avatar_fontcolor(desc.color),
          background: desc.color,
          textOverflow: "ellipsis",
          overflow: "hidden",
          ...style,
        }}
      >
        {desc.title}
      </Tag>
    </Tooltip>
  );
}
