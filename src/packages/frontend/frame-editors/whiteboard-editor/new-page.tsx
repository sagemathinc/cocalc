import { Button, Popover } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "./hooks";
import { COLORS } from "@cocalc/util/theme";
import { CSSProperties, ReactNode } from "react";

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
          onClick={() => {
            const frameId = actions.show_focused_frame_of_type(
              actions.mainFrameType
            );
            const pageId = actions.newPage(frameId);
            actions.setPageId(frameId, pageId);
            setTimeout(() => {
              // after the click
              actions.show_focused_frame_of_type(actions.mainFrameType);
              actions.setPageId(frameId, pageId);
            }, 0);
          }}
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
