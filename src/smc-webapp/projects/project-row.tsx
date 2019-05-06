/*
Render a single project entry, which goes in the list of projects
*/

import * as immutable from "immutable";
import {
  AppRedux,
  Component,
  React,
  Rendered,
  rclass,
  rtypes
} from "../app-framework";
import { ProjectUsers } from "./project-users";
import { analytics_event } from "../tracker";

const { Row, Col, Well } = require("react-bootstrap");
const { Icon, Markdown, ProjectState, Space, TimeAgo } = require("../r_misc");
const { AddCollaborators } = require("../collaborators/add-to-project");
import { id2name, ComputeImages } from "../custom-software/init";
import {
  CUSTOM_IMG_PREFIX,
  compute_image2basename
} from "custom-software/util";
const COLORS = require("smc-util/theme").COLORS;

const image_name_style: React.CSSProperties = {
  fontSize: "12px",
  color: COLORS.GRAY,
  marginTop: "5px"
};

interface Project {
  project_id: string;
  state;
  last_edited;
  description: string;
  title: string;
  compute_image: string;
}

import { user_tracking } from "../user-tracking";

interface ReactProps {
  project: Project;
  index: number;
  images?: ComputeImages;
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
    static reduxProps = () => {
      return {
        projects: {
          add_collab: rtypes.immutable.Set
        }
      };
    };

    render_status() {
      const x = this.props.project.state || { state: "closed" };
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
          } -- ${e}; please report to help@cocalc.com`
        );
      }
    }

    render_user_list() {
      const imm = this.props.redux
        .getStore("projects")
        .getIn(["project_map", this.props.project.project_id]);
      return <ProjectUsers project={imm} />;
    }

    get_collab_state(): boolean {
      return (
        this.props.add_collab != undefined &&
        this.props.add_collab.has(this.props.project.project_id)
      );
    }

    add_collab(is_displayed: boolean): void {
      this.props.redux
        .getActions("projects")
        .set_add_collab(this.props.project.project_id, is_displayed);
    }

    render_add_collab() {
      if (!this.get_collab_state()) {
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
      if (this.get_collab_state()) {
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

    // transforms the compute image ID to a human readable string
    render_image_name(): Rendered {
      const ci = this.props.project.compute_image;
      if (ci == null || this.props.images == null) return;
      if (ci.startsWith(CUSTOM_IMG_PREFIX)) {
        const id = compute_image2basename(ci);
        const img = this.props.images.get(id);
        if (img == null) return;
        const name = img.get("display");
        return <div style={image_name_style}>{name} (custom)</div>;
      } else {
        // legacy
        const name = id2name(ci);
        return <div style={image_name_style}>{name} (legacy)</div>;
      }
    }

    render_project_description() {
      if (this.props.project.description !== "No Description") {
        // don't bother showing that default; it's clutter
        return (
          <Markdown
            style={{ color: "#666" }}
            value={this.props.project.description}
          />
        );
      }
    }

    handle_mouse_down = () => {
      this.setState({
        selection_at_last_mouse_down: window.getSelection().toString()
      });
    };

    handle_click = e => {
      const cur_sel = window.getSelection().toString();
      // Check if user has highlighted some text.
      // Do NOT open if the user seems to be trying to highlight text on the row
      // eg. for copy pasting.
      if (
        this.state != null &&
        cur_sel === this.state.selection_at_last_mouse_down
      ) {
        this.open_project_from_list(e);
      }
    };

    open_project_from_list = e => {
      const project_id = this.props.project.project_id;
      this.props.redux.getActions("projects").open_project({
        project_id,
        switch_to: !(e.which === 2 || (e.ctrlKey || e.metaKey))
      });
      e.preventDefault();
      analytics_event("projects_page", "opened_a_project");
      user_tracking("open_project", { how: "projects_page", project_id });
    };

    open_project_settings = e => {
      this.props.redux.getActions("projects").open_project({
        project_id: this.props.project.project_id,
        switch_to: !(e.which === 2 || (e.ctrlKey || e.metaKey)),
        target: "settings"
      });
      e.stopPropagation();
    };

    toggle_add_collaborators = e => {
      this.add_collab(!this.get_collab_state());
      e.stopPropagation();
    };

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
              sm={3}
              style={{
                maxHeight: "7em",
                overflowY: "auto"
              }}
            >
              <div style={{ fontWeight: "bold" }}>
                {this.render_project_title()}
              </div>
              {this.render_project_description()}
            </Col>
            <Col
              onClick={this.handle_click}
              sm={3}
              style={{ color: "#666", maxHeight: "7em", overflowY: "auto" }}
            >
              {this.render_last_edited()}
              {this.render_image_name()}
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
