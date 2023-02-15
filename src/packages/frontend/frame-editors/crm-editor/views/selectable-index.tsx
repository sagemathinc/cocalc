/*

*/

import { useRef } from "react";
import { Checkbox, Tooltip } from "antd";
import { Selection } from "./use-selection";
import useMouse from "@react-hook/mouse-position";

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
  const mouse = useMouse(eltRef, { enterDelay: 100, leaveDelay: 100 });

  let body;
  if (mouse.isOver || selection.has(primaryKey)) {
    body = (
      <Checkbox
        onClick={(e) => {
          if (selection.has(primaryKey)) {
            selection.delete(primaryKey);
          } else {
            selection.add(primaryKey, index, e.shiftKey);
          }
        }}
        checked={selection.has(primaryKey)}
      />
    );
  } else {
    body = (
      <span
        onClick={(e) => {
          selection.add(primaryKey, index, e.shiftKey);
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
        background: mouse.isOver ? "#eee" : undefined,
      }}
    >
      {body}
    </div>
  );
}

export function SelectAll({ selection }: { selection: Selection }) {
  return (
    <Tooltip
      title={`${selection.all ? "Unselect" : "Select"} all ${
        selection.size
      } items`}
    >
      <div
        style={{
          minWidth: "30px",
          padding: "5px",
        }}
      >
        <Checkbox
          checked={selection.all}
          onChange={() => selection.setAll(!selection.all)}
        />
      </div>
    </Tooltip>
  );
}
