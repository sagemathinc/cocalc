import { render } from "./register";
import { redux } from "@cocalc/frontend/app-framework";

render({ type: "project_link" }, ({ field, obj, spec, viewOnly }) => {
  if (spec.type != "project_link") throw Error("bug");
  const project_id = obj[spec.project_id ?? field];
  if (!project_id) return null;
  let title = obj[field]?.trim();
  title = title ? title : "No Title";
  if (viewOnly) {
    return <>{title}</>;
  }
  return (
    <a
      onClick={() => redux.getActions("projects").open_project({ project_id })}
    >
      {title}
    </a>
  );
});
