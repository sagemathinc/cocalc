/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Checkbox, Popconfirm } from "antd";
import { Map } from "immutable";
import { join } from "path";
import { useState } from "react";

import { redux } from "@cocalc/frontend/app-framework";
import { CopyToClipBoard, Icon } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";

interface Props {
  project?: Map<string, any>;
}

export default function Sandbox({ project }: Props) {
  const [expanded, setExpanded] = useState<boolean>(false);

  if (!redux.getStore("customize")?.get("sandbox_projects_enabled")) {
    return null;
  }

  if (
    project == null ||
    project.getIn(["users", webapp_client.account_id, "group"]) != "owner"
  ) {
    // only owners can configure this settings.
    // TODO: right now we are only enforcing this via the UI on the frontend.
    // This isn't a huge issue, since a sandbox project is a free-for-all after all.
    return null;
  }

  const heading = (
    <div>
      <a
        onClick={() => {
          setExpanded(!expanded);
        }}
        style={{ cursor: "pointer" }}
      >
        {" "}
        <Icon
          style={{ width: "20px" }}
          name={expanded ? "caret-down" : "caret-right"}
        />{" "}
        {project?.get("sandbox") ? (
          <b>This is a Public Sandbox Workspace...</b>
        ) : (
          "Make this a public sandbox workspace..."
        )}
      </a>
    </div>
  );
  if (!expanded) {
    return heading;
  }

  function render_link() {
    if (!project?.get("sandbox")) {
      return (
        <div>
          <p>
            If you make this workspace a public sandbox workspace, then you can
            share any URL in your workspace and when somebody visits that URL
            they will automatically be added as a collaborator to your
            workspace. All collaborators who are not the owner will be removed
            if they are not active for about 10 minutes. Any trial, member
            hosting, and network banners are also not visible.
          </p>
          <p>
            Only do this if you have very minimal security requirements for the
            content of this workspace, and have no concern about potential cross
            site scripting attacks, e.g., you are running cocalc on a private
            network, or only share this URL with trusted people.
          </p>
        </div>
      );
    }
    return (
      <div>
        <p>Share this URL, or the URL of any file in your project:</p>
        <CopyToClipBoard
          value={`${document.location.origin}${join(
            appBasePath,
            "projects",
          )}/${project?.get("project_id")}`}
          style={{ width: "100%", marginBottom: "15px" }}
        />
        <p>
          When somebody with an account visits that URL, they will automatically
          be added as a collaborator to this project.
        </p>
      </div>
    );
  }

  return (
    <div>
      {heading}
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: "5px",
          padding: "15px",
          marginTop: "5px",
        }}
      >
        {project.get("sandbox") ? (
          <Checkbox
            checked
            onChange={() => {
              redux
                .getActions("projects")
                .set_project_sandbox(project.get("project_id"), false);
            }}
          >
            Public Sandbox Workspace
          </Checkbox>
        ) : (
          <Popconfirm
            title={
              <div style={{ maxWidth: "450px" }}>
                Are you absolutely sure?
                <Alert
                  style={{ margin: "15px" }}
                  showIcon
                  type="warning"
                  message="SECURITY WARNING"
                  description="Only do this if you have very minimal
                security requirements for the content of this project, and have
                no concern about potential cross site scripting attacks, e.g.,
                you are running cocalc on a private network, or only share this
                URL with trusted people."
                />
                NOTE: You can always disable sandbox mode later, remove any
                collaborators that were added, and collaborators can't delete
                backups or TimeTravel history.
              </div>
            }
            onConfirm={() => {
              redux
                .getActions("projects")
                .set_project_sandbox(project.get("project_id"), true);
            }}
            okText={"Yes, make this a public sandbox project!"}
            cancelText={<CancelText />}
          >
            <Checkbox checked={false}>Public Sandbox Workspace</Checkbox>
          </Popconfirm>
        )}
        <br />
        <br />
        {render_link()}
      </div>
    </div>
  );
}
