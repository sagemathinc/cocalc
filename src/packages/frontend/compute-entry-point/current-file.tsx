import { Content } from "@cocalc/frontend/project/page/content";
import {
  FrameContext,
  defaultFrameContext,
} from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { path_to_tab } from "@cocalc/util/misc";
import { redux } from "@cocalc/frontend/app-framework";
import {
  ProjectContext,
  useProjectContextProvider,
} from "@cocalc/frontend/project/context";
import { useEffect } from "react";

export default function CurrentFile({
  project_id,
  currentFile,
}) {
  const tab_name = path_to_tab(currentFile);
  const projectCtx = useProjectContextProvider(project_id, true);
  useEffect(() => {
    const actions = redux.getProjectActions(project_id);
    actions.set_active_tab(tab_name);
  }, [tab_name, project_id]);

  return (
    <div className="smc-vfill" style={{ borderLeft: "1px solid #ddd" }}>
      <ProjectContext.Provider value={projectCtx}>
        <FrameContext.Provider
          key={tab_name}
          value={{
            ...defaultFrameContext,
            project_id,
            path: currentFile,
            actions: redux.getEditorActions(project_id, currentFile) as any,
            isFocused: true,
            isVisible: true,
            redux,
          }}
        >
          <Content is_visible={true} tab_name={tab_name} />
        </FrameContext.Provider>
      </ProjectContext.Provider>
    </div>
  );
}
