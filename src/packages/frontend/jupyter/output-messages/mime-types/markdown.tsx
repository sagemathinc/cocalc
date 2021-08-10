import React from "react";
import register from "./register";
import { Markdown } from "@cocalc/frontend/r_misc";

register("text/markdown", ({ project_id, value, directory, trust }) => {
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
