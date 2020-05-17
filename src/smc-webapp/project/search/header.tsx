import { React } from "../../app-framework";
import { Icon } from "../../r_misc";
import { PathNavigator } from "../explorer/path-navigator";

export const ProjectSearchHeader: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  return (
    <h1 style={{ marginTop: "0px" }}>
      <Icon name="search" /> Search{" "}
      <span className="hidden-xs">
        {" "}
        in{" "}
        <PathNavigator project_id={project_id} style={{ display: "inline" }} />
      </span>
    </h1>
  );
};
