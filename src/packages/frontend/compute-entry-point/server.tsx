import { Explorer } from "@cocalc/frontend/project/explorer";
import {
  ProjectContext,
  useProjectContextProvider,
} from "@cocalc/frontend/project/context";
import DocStatus from "@cocalc/frontend/compute/doc-status";

export default function Project({ project_id, compute_server_id }) {
  const projectCtx = useProjectContextProvider(project_id, true);
  return (
    <ProjectContext.Provider value={projectCtx}>
      <div className="smc-vfill">
        <DocStatus
          project_id={project_id}
          id={compute_server_id}
          requestedId={compute_server_id}
        />
        <Explorer minimal />
      </div>
    </ProjectContext.Provider>
  );
}
