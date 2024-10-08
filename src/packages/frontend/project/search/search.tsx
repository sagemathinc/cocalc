import { ProjectSearchBody } from "./body";

import { ProjectSearchHeader } from "./header";

export const ProjectSearch: React.FC = () => {
  return (
    <div style={{ padding: "15px" }}>
      <ProjectSearchHeader />
      <ProjectSearchBody mode="project" />
    </div>
  );
};
