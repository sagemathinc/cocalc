import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { createSearchEditor } from "@cocalc/frontend/frame-editors/generic/search";

export const DONE = "☑ ";

function Preview({ content }) {
  return (
    <StaticMarkdown
      value={content}
      style={{
        marginBottom: "-10px" /* account for <p> */,
        opacity: content.startsWith(DONE) ? 0.5 : undefined,
      }}
    />
  );
}

export const search = createSearchEditor({
  Preview,
  updateField: "tasks",
  title: "Task List",
});
