import { Button, Popconfirm } from "antd";
import { plural } from "@cocalc/util/misc";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";

export default function RemoveMyself({ project_ids }) {
  const account_id = useTypedRedux("account", "account_id");

  return (
    <Popconfirm
      title="Remove myself from projects"
      description={
        <div style={{ maxWidth: "400px" }}>
          Are you sure to remove yourself from up to {project_ids.length}{" "}
          {plural(project_ids.length, "project")}? You will no longer have
          access and cannot add yourself back.{" "}
          <b>You will not be removed from projects you own.</b>
        </div>
      }
      onConfirm={() => {
        const projects = redux.getActions("projects");
        const page = redux.getActions("page");
        for (const project_id of project_ids) {
          try {
            projects.remove_collaborator(project_id, account_id);
            page.close_project_tab(project_id);
          } catch {}
        }
      }}
      okText="Yes"
      cancelText="No"
    >
      <Button>Remove Myself...</Button>
    </Popconfirm>
  );
}
