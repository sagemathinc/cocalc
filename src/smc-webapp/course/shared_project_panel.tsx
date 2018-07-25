/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016 -- 2017, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//#############################################################################

import { React, Component, AppRedux } from "../app-framework";
import { CourseActions } from "./actions";
const {
  Alert,
  Button,
  ButtonToolbar,
  Row,
  Col,
  Panel
} = require("react-bootstrap");
const { HiddenXS, Icon, Tip, VisibleMDLG } = require("../r_misc");

interface SharedProjectPanelProps {
  shared_project_id?: string;
  redux: AppRedux;
  name: string;
}

interface SharedProjectPanelState {
  confirm_create: boolean;
}

export class SharedProjectPanel extends Component<
  SharedProjectPanelProps,
  SharedProjectPanelState
> {
  displayName: "CourseEditor-SharedProject";

  constructor(props) {
    super(props);
    this.state = {
      confirm_create: false
    };
  }

  shouldComponentUpdate(props, state) {
    return (
      this.state.confirm_create !== state.confirm_create ||
      this.props.shared_project_id !== props.shared_project_id
    );
  }

  get_actions(): CourseActions {
    return this.props.redux.getActions(this.props.name);
  }

  panel_header_text() {
    if (this.props.shared_project_id) {
      return "Shared project that everybody can fully use";
    } else {
      return "Optionally create a shared project for everybody";
    }
  }

  render() {
    return (
      <Row>
        <Col md={6}>
          <Panel
            header={
              <h4>
                <Icon name="users" /> {this.panel_header_text()}{" "}
              </h4>
            }
          >
            {this.render_content()}
          </Panel>
        </Col>
      </Row>
    );
  }

  render_content() {
    if (this.props.shared_project_id) {
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
        <Button onClick={this.open_project}>
          <Icon name="edit" /> Open shared project
        </Button>
      </div>
    );
  }

  open_project = () => {
    return this.props.redux
      .getActions("projects")
      .open_project({ project_id: this.props.shared_project_id });
  };

  render_no_shared_project() {
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
        <Button
          onClick={() => this.setState({ confirm_create: true })}
          disabled={this.state.confirm_create}
        >
          <Icon name="plus" /> Create shared project...
        </Button>
        {this.render_confirm_create()}
      </div>
    );
  }

  render_confirm_create() {
    if (this.state.confirm_create) {
      return (
        <Alert bsStyle="warning" style={{ marginTop: "15px" }}>
          <ButtonToolbar>
            <Button
              bsStyle="warning"
              onClick={() => {
                this.setState({ confirm_create: false });
                return this.create_shared_project();
              }}
            >
              Create shared project for everybody involved in this class
            </Button>
            <Button onClick={() => this.setState({ confirm_create: false })}>
              Cancel
            </Button>
          </ButtonToolbar>
        </Alert>
      );
    }
  }

  create_shared_project() {
    return this.get_actions().create_shared_project();
  }
}

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
