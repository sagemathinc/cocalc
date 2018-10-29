/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Render a single project entry, which goes in the list of projects
*/

import * as immutable from "immutable";
import { AppRedux, React, Component, rclass } from "../app-framework";

const { Row, Col, Well } = require("react-bootstrap");
const {
  Icon,
  Markdown,
  ProjectState,
  Space,
  TimeAgo
} = require("../r_misc");
const { AddCollaborators } = require("../collaborators/add-to-project");
const { ProjectUsers } = require("./project-users");

interface ReactProps {
  project: any;
  index: number;
  redux: AppRedux;
}

interface ReduxProps {
  add_collab: immutable.Set<string>;
}

interface State {
  selection_at_last_mouse_down: string;
}

export const ProjectRow = rclass<ReactProps>(
  class ProjectRow extends Component<ReactProps & ReduxProps, State> {
    render_status() {
      const x =
        this.props.project.state != null
          ? this.props.project.state
          : { state: "closed" };
      return (
        <a>
          <ProjectState state={immutable.fromJS(x)} />
        </a>
      );
    }

    render_last_edited() {
      try {
        return (
          <TimeAgo
            date={new Date(this.props.project.last_edited).toISOString()}
          />
        );
      } catch (e) {
        return console.warn(
          `error setting time of project ${this.props.project.project_id} to ${
            this.props.project.last_edited
          } -- ${e}; please report to help@sagemath.com`
        );
      }
    }

    render_user_list() {
      const imm = this.props.redux
        .getStore("projects")
        .getIn(["project_map", this.props.project.project_id]);
      return <ProjectUsers project={imm} />;
    }

    add_collab(set?): void {
      const { project_id } = this.props.project;
      if (set != null) {
        this.props.redux
          .getActions("projects")
          .set_add_collab(project_id, set);
      } else {
        this.props.add_collab != null
          ? this.props.add_collab.has(project_id)
          : undefined;
      }
    }

    render_add_collab() {
      if (!this.add_collab()) {
        return;
      }
      // We get the immutable.js project object since that's what
      // the add collaborators object expects.   @props.project
      // should be immutable js, but that's not what we implemented
      // long ago, and I'm not fixing this now.  This won't result
      // in bad/stale data that matters, since when this object
      // changes, then @props.project changes.
      const imm = this.props.redux
        .getStore("projects")
        .getIn(["project_map", this.props.project.project_id]);
      return <AddCollaboratorsArea project={imm} />;
    }

    render_collab_caret() {
      let icon;
      if (this.add_collab()) {
        icon = <Icon name="caret-down" />;
      } else {
        icon = <Icon name="caret-right" />;
      }
      return <span style={{ fontSize: "15pt" }}>{icon}</span>;
    }

    render_collab() {
      return (
        <div>
          <div
            style={{ maxHeight: "7em", overflowY: "auto" }}
            onClick={this.toggle_add_collaborators}
          >
            <a>
              {" "}
              {this.render_collab_caret()} <Space />
              <Icon
                name="user"
                style={{ fontSize: "16pt", marginRight: "10px" }}
              />
              {this.render_user_list()}
            </a>
          </div>
          {this.render_add_collab()}
        </div>
      );
    }

    render_project_title() {
      return (
        <a>
          <Markdown value={this.props.project.title} />
        </a>
      );
    }

    render_project_description() {
      if (this.props.project.description !== "No Description") {
        // don't bother showing that default; it's clutter
        return <Markdown value={this.props.project.description} />;
      }
    }

    handle_mouse_down = () => {
      this.setState({
        selection_at_last_mouse_down: window.getSelection().toString()
      });
    }

    handle_click = (e) => {
      if (
        window.getSelection().toString() ===
        this.state.selection_at_last_mouse_down
      ) {
        this.open_project_from_list(e);
      }
    }

    open_project_from_list = (e) => {
      this.props.redux.getActions("projects").open_project({
        project_id: this.props.project.project_id,
        switch_to: !(e.which === 2 || (e.ctrlKey || e.metaKey))
      });
      e.preventDefault();
    }

    open_project_settings = (e) => {
      this.props.redux.getActions("projects").open_project({
        project_id: this.props.project.project_id,
        switch_to: !(e.which === 2 || (e.ctrlKey || e.metaKey)),
        target: "settings"
      });
      e.stopPropagation();
    }

    toggle_add_collaborators = (e) => {
      this.add_collab(!this.add_collab());
      e.stopPropagation();
    }

    render() {
      const project_row_styles = {
        backgroundColor: this.props.index % 2 ? "#eee" : "white",
        marginBottom: 0,
        cursor: "pointer",
        wordWrap: "break-word"
      };

      return (
        <Well style={project_row_styles} onMouseDown={this.handle_mouse_down}>
          <Row>
            <Col
              onClick={this.handle_click}
              sm={2}
              style={{
                fontWeight: "bold",
                maxHeight: "7em",
                overflowY: "auto"
              }}
            >
              {this.render_project_title()}
            </Col>
            <Col
              onClick={this.handle_click}
              sm={2}
              style={{ color: "#666", maxHeight: "7em", overflowY: "auto" }}
            >
              {this.render_last_edited()}
            </Col>
            <Col
              onClick={this.handle_click}
              sm={2}
              style={{ color: "#666", maxHeight: "7em", overflowY: "auto" }}
            >
              {this.render_project_description()}
            </Col>
            <Col sm={4}>{this.render_collab()}</Col>
            <Col sm={2} onClick={this.open_project_settings}>
              {this.render_status()}
            </Col>
          </Row>
        </Well>
      );
    }
  }
);

function AddCollaboratorsArea({ project }) {
  return (
    <div>
      <h5>Add people</h5>
      <div style={{ color: "#666", marginBottom: "10px" }}>
        Who would you like to work with on this project?
      </div>
      <AddCollaborators project={project} inline={true} />
    </div>
  );
}
