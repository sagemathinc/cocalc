import register from "./register";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";

register("text/markdown", 4, ({ value }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <Markdown value={value} />
    </div>
  );
});

// put latex as Markdown, since jupyter upstream requires $'s etc around the text/latex anyways,
// or at least people tend to use them.
register("text/latex", 3.5, ({ value }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <Markdown value={value} />
    </div>
  );
});
