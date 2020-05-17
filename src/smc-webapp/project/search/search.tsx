const { ProjectSearchBody } = require("../../project_search");
import { project_redux_name, redux, React } from "../../app-framework";
import { ProjectSearchHeader } from "./header";

export const ProjectSearch: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const name = project_redux_name(project_id);
  const actions = redux.getProjectActions(project_id);
  return (
    <div style={{ padding: "15px" }}>
      <ProjectSearchHeader project_id={project_id} />
      <ProjectSearchBody actions={actions} name={name} />
    </div>
  );
};
