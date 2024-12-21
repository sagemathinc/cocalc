import { Icon } from "@cocalc/frontend/components/icon";
import { Button } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { useRedux } from "@cocalc/frontend/app-framework";
import { useState } from "react";

export function AddCommentTitleBarButton() {
  const [adding, setAdding] = useState<boolean>(false);
  const { actions, id, project_id, path, isFocused } = useFrameContext();
  const commentSelection = useRedux(
    ["comment_selection"],
    project_id,
    path,
  )?.has(id);
  if (!id || !isFocused || !commentSelection) {
    return null;
  }

  const addComment = async () => {
    try {
      setAdding(true);
      const commentId = await actions.addComment(id);
      console.log({ commentId });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Button
      disabled={adding}
      size="small"
      style={{ float: "right", height: "19px" }}
      onClick={addComment}
    >
      <Icon name="comment" /> Add comment
    </Button>
  );
}
