import { ProjectSearchBody } from "./body";
import { React } from "../../app-framework";
import { ProjectSearchHeader } from "./header";

export const ProjectSearch: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  return (
    <div style={{ padding: "15px" }}>
      <ProjectSearchHeader project_id={project_id} />
      <ProjectSearchBody project_id={project_id} />
    </div>
  );
};
