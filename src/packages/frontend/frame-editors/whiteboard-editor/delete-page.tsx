import { Button, Popconfirm, Tooltip } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { useFrameContext } from "./hooks";
import { COLORS } from "@cocalc/util/theme";

export default function DeletePage({ pageId }) {
  const { actions } = useFrameContext();
  return (
    <Popconfirm
      title={"Delete this page?"}
      onConfirm={(e) => {
        e?.stopPropagation();
        actions.deletePage(pageId);
      }}
      onCancel={(e) => {
        e?.stopPropagation();
      }}
    >
      <Tooltip title="Delete this page" placement="right" mouseEnterDelay={1}>
        <Button
          type="text"
          size="small"
          icon={<Icon style={{ color: COLORS.FILE_ICON }} name="trash" />}
          onClick={(e) => {
            e?.stopPropagation();
          }}
        />
      </Tooltip>
    </Popconfirm>
  );
}
