import ShowError from "@cocalc/frontend/components/error";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { StopProject } from "./stop-project";
import MoveProject from "./move-project";
import { Space } from "antd";

export default function ProjectControlError({
  style,
  showStopButton,
}: {
  style?;
  showStopButton?: boolean;
}) {
  const { project_id } = useProjectContext();
  const control_error = useTypedRedux({ project_id }, "control_error");
  if (!control_error) {
    return null;
  }

  return (
    <div style={style}>
      <ShowError
        error={control_error}
        setError={() => {
          const actions = redux.getProjectActions(project_id);
          actions.setState({ control_error: "" });
        }}
      />
      <Space>
        {!!control_error && showStopButton && (
          <div style={{ margin: "15px", textAlign: "center" }}>
            <StopProject force project_id={project_id} size="large" />
          </div>
        )}
        {!!control_error && (
          <MoveProject force project_id={project_id} size="large" />
        )}
      </Space>
    </div>
  );
}
