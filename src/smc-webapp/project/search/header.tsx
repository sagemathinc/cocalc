import { PathLink } from "../new/path-link";
import { React, useRedux, redux } from "../../app-framework";
import { Icon } from "../../r_misc";

export const ProjectSearchHeader: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const current_path = useRedux(["current_path"], project_id);
  return (
    <h1 style={{ marginTop: "0px" }}>
      <Icon name="search" /> Search{" "}
      <span className="hidden-xs">
        {" "}
        in{" "}
        {current_path ? (
          <PathLink
            path={current_path}
            actions={redux.getProjectActions(project_id)}
          />
        ) : (
          "home directory"
        )}
      </span>
    </h1>
  );
};
