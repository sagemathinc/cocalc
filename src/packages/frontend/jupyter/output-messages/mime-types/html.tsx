import register from "./register";
import { HTML } from "@cocalc/frontend/components";

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

// HTML should definitely have higher priority than
// LaTeX.  For example, Julia tables are output as both
// **completely broken** text/latex that everybody ignores,
// and as text/html that looks good.
register("text/html", 5, Html);

// put latex as HTML, since jupyter requires $'s anyways:
register("text/latex", 3, Html);
