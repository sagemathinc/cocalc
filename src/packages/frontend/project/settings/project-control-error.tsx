import ShowError from "@cocalc/frontend/components/error";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { StopProject } from "./stop-project";

export default function ProjectControlError({ style }: { style? }) {
  const { project_id } = useProjectContext();
  const control_error = useTypedRedux({ project_id }, "control_error");

  return (
    <div style={style}>
      <ShowError
        error={control_error}
        setError={() => {
          const actions = redux.getProjectActions(project_id);
          actions.setState({ control_error: "" });
        }}
      />
      {!!control_error && (
        <div style={{ margin: "15px", textAlign: "center" }}>
          <StopProject force project_id={project_id} size="large" />
        </div>
      )}
    </div>
  );
}
