import { useMemo } from "react";
import { useTags } from "../querydb/tags";
import { Tag } from "./tags";

interface Props {
  id: number;
  onClose?: Function;
  confirm?: boolean;
}

export function TagById({ id, onClose, confirm }: Props) {
  const tags = useTags();
  const tag = useMemo(() => {
    return tags?.[id];
  }, [tags, id]);
  return (
    <Tag
      color={tag?.color}
      icon={tag?.icon}
      onClose={onClose}
      confirm={confirm}
    >
      {tag == null ? (tags != null ? "..." : "Loading...") : tag?.name}
    </Tag>
  );
}
