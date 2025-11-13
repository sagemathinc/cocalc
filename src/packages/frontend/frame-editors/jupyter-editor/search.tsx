// import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { createSearchEditor } from "@cocalc/frontend/frame-editors/generic/search";

export const DONE = "☑ ";

function Preview({ content, fontSize }) {
  return <pre style={{ fontSize }}>{content}</pre>;
  //   return (
  //     <StaticMarkdown
  //       value={content}
  //       style={{
  //         marginBottom: "-10px" /* account for <p> */,
  //       }}
  //     />
  //   );
}

export const search = createSearchEditor({
  Preview,
  updateField: "cells",
  title: "Jupyter Notebook",
});
