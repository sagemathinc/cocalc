import register from "./register";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

register("text/markdown", 4, ({ value }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <StaticMarkdown value={value} />
    </div>
  );
});

