import React from "react";
import register from "./register";
import { HTML } from "@cocalc/frontend/r_misc";

const Html = ({
  project_id,
  value,
  directory,
  trust,
}: {
  project_id?: string;
  value: any;
  directory?: string;
  trust?: boolean;
}) => {
  return (
    <div style={{ margin: "5px 0" }}>
      <HTML
        value={value}
        auto_render_math={true}
        project_id={project_id}
        file_path={directory}
        safeHTML={!trust}
      />
    </div>
  );
};

register("text/html", 3, Html);

// put latex as HTML, since jupyter requires $'s anyways:
register("text/latex", 3, Html);
