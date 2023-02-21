import { Popconfirm } from "antd";
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
      <Icon
        style={{ color: COLORS.FILE_ICON, marginLeft: "5px" }}
        name="trash"
        onClick={(e) => {
          e?.stopPropagation();
        }}
      />
    </Popconfirm>
  );
}
