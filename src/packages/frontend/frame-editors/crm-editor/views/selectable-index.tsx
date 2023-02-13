import { useRef } from "react";
import { Checkbox } from "antd";
import { Selection } from "./use-selection";
import useHover from "@react-hook/hover";

interface Props {
  index: number; // the record number (0-based)
  primaryKey: any; // the value of the primary key for this record
  selection: Selection;
}

export default function SelectableIndex({
  index,
  primaryKey,
  selection,
}: Props) {
  const eltRef = useRef<any>(null);
  const isHovering = useHover(eltRef);

  let body;
  if (isHovering || selection.has(primaryKey)) {
    body = (
      <Checkbox
        onClick={() => {
          if (selection.has(primaryKey)) {
            selection.delete(primaryKey);
          } else {
            selection.add(primaryKey);
          }
        }}
        checked={selection.has(primaryKey)}
      />
    );
  } else {
    body = (
      <span
        onClick={() => {
          selection.add(primaryKey);
        }}
        style={{ color: "#707070" }}
      >
        {index + 1}
      </span>
    );
  }
  return (
    <div
      ref={eltRef}
      style={{
        minWidth: "30px",
        padding: "5px",
        background: isHovering ? "#eee" : undefined,
      }}
    >
      {body}
    </div>
  );
}
