import { render } from "./register";
import { redux } from "@cocalc/frontend/app-framework";

render({ type: "project_link" }, ({ field, obj, spec }) => {
  if (spec.type != "project_link") throw Error("bug");
  const project_id = obj[spec.project_id ?? field];
  if (!project_id) return null;
  return (
    <a
      onClick={() => redux.getActions("projects").open_project({ project_id })}
    >
      {obj[field]}
    </a>
  );
});
