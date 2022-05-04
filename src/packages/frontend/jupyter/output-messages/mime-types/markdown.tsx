import register from "./register";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

register("text/markdown", 4, ({ value }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <StaticMarkdown value={value} />
    </div>
  );
});

// Put latex as Markdown, since jupyter requires $'s anyways.
// More precisely, kernels use $'s.  We did use html before, but
// that forces us to use a jquery plugin etc no matter what,
// which is less efficient and less flexible.
register("text/latex", 6, StaticMarkdown);
