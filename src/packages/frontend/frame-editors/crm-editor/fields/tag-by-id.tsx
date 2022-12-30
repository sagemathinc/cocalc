import { useMemo } from "react";
import { useTags } from "../querydb/tags";
import { Tag } from "./tags";

interface Props {
  id: number;
  onClose?: Function;
  confirm?: boolean;
  Draggable?;
}

export function TagById({ id, onClose, confirm, Draggable }: Props) {
  const tags = useTags();
  const tag = useMemo(() => {
    return tags?.[id];
  }, [tags, id]);

  let name: string;
  if (tag == null) {
    name = tags != null ? "..." : "Loading...";
  } else {
    name = tag?.name ?? "...";
  }
  return (
    <Tag
      color={tag?.color}
      icon={tag?.icon}
      onClose={onClose}
      confirm={confirm}
    >
      {Draggable != null ? <Draggable>{name}</Draggable> : name}
    </Tag>
  );
}
