/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Component, AppRedux, Rendered } from "../../app-framework";
import { CourseActions } from "../actions";
import { CourseSettingsRecord } from "../store";
import { HiddenXS, Icon, Tip, VisibleMDLG } from "../../r_misc";
import { UsergroupAddOutlined } from "@ant-design/icons";

import { Button, Popconfirm } from "antd";

interface SharedProjectPanelProps {
  settings: CourseSettingsRecord;
  redux: AppRedux;
  name: string;
}

export class SharedProjectPanel extends Component<SharedProjectPanelProps> {
  public shouldComponentUpdate(props): boolean {
    return (
      this.props.settings.get("shared_project_id") !==
      props.settings.get("shared_project_id")
    );
  }

  private panel_header_text(): string {
    if (this.props.settings.get("shared_project_id")) {
      return "Shared project that everybody can fully use";
    } else {
      return "Optionally create a shared project for everybody";
    }
  }

  render_content() {
    if (this.props.settings.get("shared_project_id")) {
      return this.render_has_shared_project();
    } else {
      return this.render_no_shared_project();
    }
  }

  render_has_shared_project() {
    return (
      <div>
        <div style={{ color: "#444" }}>
          <p>
            You created a common shared project, which everybody -- students and
            all collaborators on this project (your TAs and other instructors)
            -- have <b>write</b> access to. Use this project for collaborative
            in-class labs, course-wide chat rooms, and making miscellaneous
            materials available for students to experiment with together.
          </p>
          <p>
            When you created the shared project, everybody who has already
            created an account is added as a collaborator to the project.
            Whenever you re-open this course, any students or collaborators on
            the project that contains this course will be added to the shared
            project.
          </p>
        </div>
        <br />
        <Button onClick={this.open_project} size={"large"}>
          Open shared project...
        </Button>
      </div>
    );
  }

  open_project = () => {
    this.props.redux.getActions("projects").open_project({
      project_id: this.props.settings.get("shared_project_id"),
    });
  };

  private render_no_shared_project(): Rendered {
    return (
      <div>
        <div style={{ color: "#444" }}>
          <p>
            <i>Optionally</i> create a single common shared project, which
            everybody -- students and all collaborators on this project (your
            TAs and other instructors) -- will have <b>write</b> access to. This
            can be useful for collaborative in-class labs, course-wide chat
            rooms, and making miscellanous materials available for students to
            experiment with together.
          </p>
          <p>
            When you create the shared project, everybody who has already
            created an account is added as a collaborator to the project.
            Whenever you re-open this course, any students or collaborators on
            the project that contains this course will be added to the shared
            project.
          </p>
          <p>
            After you create the shared project, you should move the shared
            project to a members only server or upgrade it in other ways if you
            want it to be more stable.
          </p>
        </div>
        <br />
        <Popconfirm
          title="Are you sure you want to create a shared project and add all students in this course as collaborators?"
          onConfirm={() => {
            const actions = this.props.redux.getActions(
              this.props.name
            ) as CourseActions;
            if (actions != null) actions.shared_project.create();
          }}
          okText="Create Shared Project"
          cancelText="Cancel"
        >
          <Button size={"large"} icon={<UsergroupAddOutlined />}>
            Create shared project...
          </Button>
        </Popconfirm>
      </div>
    );
  }
  public render(): Rendered {
    return (
      <div
        className="smc-vfill"
        style={{
          padding: "15px",
          margin: "15px auto",
          border: "1px solid #ccc",
          maxWidth: "800px",
          overflowY: "auto",
        }}
      >
        <h4>
          <Icon name="users" /> {this.panel_header_text()}{" "}
        </h4>
        {this.render_content()}
      </div>
    );
  }
}

// TODO: delete this
export function SharedProjectPanelHeader(props: { project_exists: boolean }) {
  let tip;
  if (props.project_exists) {
    tip = "Shared project that everybody involved in this course may use.";
  } else {
    tip = "Create a shared project that everybody in this course may use.";
  }
  return (
    <Tip delayShow={1300} title="Shared project" tip={tip}>
      <span>
        <Icon name="share-alt" />{" "}
        <HiddenXS>
          Shared <VisibleMDLG>Project</VisibleMDLG>
        </HiddenXS>
      </span>
    </Tip>
  );
}
