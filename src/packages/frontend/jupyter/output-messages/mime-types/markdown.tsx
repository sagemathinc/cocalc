import register from "./register";
import { Markdown } from "@cocalc/frontend/components";

register("text/markdown", 4, ({ project_id, value, directory, trust }) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <Markdown
        value={value}
        project_id={project_id}
        file_path={directory}
        safeHTML={!trust}
      />
    </div>
  );
});
