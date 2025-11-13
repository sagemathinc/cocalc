import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { TimeAgo } from "@cocalc/frontend/components";
import { createSearchEditor } from "@cocalc/frontend/frame-editors/generic/search";

function Preview({ id, content }) {
  return (
    <>
      <TimeAgo
        style={{ float: "right", color: "#888" }}
        date={parseFloat(id)}
      />
      <StaticMarkdown
        value={content}
        style={{ marginBottom: "-10px" /* account for <p> */ }}
      />
    </>
  );
}

export const search = createSearchEditor({
  Preview,
  updateField: "messages",
  title: "Chatroom",
});
