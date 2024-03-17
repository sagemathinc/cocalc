import { ProjectSearchBody } from "./body";
import { ProjectSearchHeader } from "./header";

export function ProjectSearch() {
  return (
    <div style={{ padding: "15px" }}>
      <ProjectSearchHeader />
      <ProjectSearchBody mode="project" />
    </div>
  );
}
