/*
Editing bar for editing one (or more) selected elements.
*/

import { Tooltip, Button } from "antd";
import { Element } from "../types";
import { PANEL_STYLE } from "./panel";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "../actions";

interface Props {
  elements: Element[];
}

export default function EditBar({ elements }: Props) {
  const { actions } = useFrameContext();
  return (
    <div
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        right: 0,
        bottom: 0,
      }}
    >
      <div style={{ display: "flex" }}>
        <Tooltip title="Delete">
          <Button
            type="text"
            onClick={() => {
              console.log("delete ", elements);
              for (const { id } of elements) {
                (actions as Actions).delete(id);
              }
              actions.syncstring_commit();
            }}
          >
            <Icon name="trash" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
