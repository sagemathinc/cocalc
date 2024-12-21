import { Icon } from "@cocalc/frontend/components/icon";
import { Button } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { useRedux } from "@cocalc/frontend/app-framework";
import { useState } from "react";

export function AddCommentTitleBarButton() {
  const [adding, setAdding] = useState<boolean>(false);
  const { id, project_id, path, isFocused, actions, ambientActions } =
    useFrameContext();
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
      // create the marked range in the document
      const commentId = await actions.addComment(id);
      if (commentId == null) {
        throw Error("unable to create comment");
      }
      // create the side chat that references the marked range
      const sideChat = await ambientActions.getSideChatActions();
      await sideChat.sendChat({
        noNotification: true,
        comment: {
          id: commentId,
          ...(path != actions.path ? { path: actions.path } : undefined),
        },
        editing: true,
      });
    } catch (err) {
      ambientActions.set_error(`Error creating comment: ${err}`);
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
