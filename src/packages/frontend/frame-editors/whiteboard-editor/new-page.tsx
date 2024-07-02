import { Button, Popover, Tooltip } from "antd";
import { CSSProperties, ReactNode } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { useFrameContext } from "./hooks";

function addPage(actions, afterPageId?) {
  const frameId = actions.show_focused_frame_of_type(actions.mainFrameType);
  const pageId = actions.newPage(frameId, afterPageId);
  actions.setPageId(frameId, pageId);
  setTimeout(() => {
    // after the click
    actions.show_focused_frame_of_type(actions.mainFrameType);
    actions.setPageId(frameId, pageId);
  }, 0);
}

export default function NewPage({
  style,
  tip,
  label,
}: {
  style?: CSSProperties;
  tip?: ReactNode;
  label?: ReactNode;
}) {
  const { actions } = useFrameContext();
  return (
    <div style={{ ...style, textAlign: "center" }}>
      <Popover
        title={
          <>
            <Icon name="plus-circle" /> Create a New Page
          </>
        }
        content={<div style={{ maxWidth: "400px" }}>{tip}</div>}
      >
        <Button
          size="large"
          style={{ height: "auto", padding: "20px" }}
          onClick={() => addPage(actions)}
        >
          <Icon
            name="plus-circle"
            style={{ fontSize: "200%", color: COLORS.FILE_ICON }}
          />
          <br />
          {label ?? "New Page"}
        </Button>
      </Popover>
    </div>
  );
}

// adding a page right after an existing page
export function AddPage({ pageId }: { pageId: string }) {
  const { actions } = useFrameContext();
  return (
    <Tooltip title="Insert new page" placement="right" mouseEnterDelay={1}>
      <Button
        type="text"
        size="small"
        onClick={() => addPage(actions, pageId)}
        icon={<Icon name="plus-circle" style={{ color: COLORS.FILE_ICON }} />}
      />
    </Tooltip>
  );
}
