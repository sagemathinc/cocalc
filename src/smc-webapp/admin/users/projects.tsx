/*
Show a table with links to recently used projects (with most recent first) that

 - account_id: have a given account_id as collaborator; here we
               show only the most recently used projects by them,
               not everything. This is sorted by when *they* used
               it last.

 - license_id: has a given license applied: here we show all projects
               that are currently running with this license actively
               upgrading them.  Projects are sorted by their
               last_edited field.

*/

import { React, Component, Rendered, redux } from "smc-webapp/app-framework";

import { cmp, keys, trunc_middle } from "smc-util/misc2";

import { Loading, TimeAgo } from "smc-webapp/r_misc";

import { query } from "smc-webapp/frame-editors/generic/client";

import { Row, Col } from "react-bootstrap";

const { Panel } = require("react-bootstrap"); // fighting with stupid typescript declarations!

interface Project {
  project_id: string;
  title: string;
  description: string;
  users: Map<string, any>;
  last_active: Map<string, any>;
  last_edited: Date;
}

interface Props {
  account_id?: string; // one of account_id or license_id must be given; see comments above
  license_id?: string;
  cutoff?: "now" | Date; // if given, and showing projects for a license, show projects that ran back to cutoff.
  title?: string | Rendered; // Defaults to "Projects"
}

interface State {
  status?: string;
  projects?: Project[];
}

function project_sort_key(
  project: Project,
  account_id?: string
): string | Date {
  if (!account_id) return project.last_edited ?? new Date(0);
  if (project.last_active && project.last_active[account_id]) {
    return project.last_active[account_id];
  }
  return "";
}

export class Projects extends Component<Props, State> {
  private mounted: boolean = false;

  constructor(props, state) {
    super(props, state);
    this.state = {};
  }

  componentWillMount(): void {
    this.mounted = true;
    this.search();
  }

  componentWillUnmount(): void {
    this.mounted = false;
  }

  componentDidUpdate(prevProps) {
    if (this.props.cutoff != prevProps.cutoff) {
      this.search();
    }
  }

  status_mesg(s: string): void {
    this.setState({
      status: s
    });
  }

  private query() {
    if (this.props.account_id) {
      return {
        query: {
          projects: [
            {
              project_id: null,
              title: null,
              description: null,
              users: null,
              last_active: null,
              last_edited: null
            }
          ]
        },
        options: [{ account_id: this.props.account_id }]
      };
    } else if (this.props.license_id) {
      let cutoff: undefined | Date =
        !this.props.cutoff || this.props.cutoff == "now"
          ? undefined
          : this.props.cutoff;
      return {
        query: {
          projects_using_site_license: [
            {
              license_id: this.props.license_id,
              project_id: null,
              title: null,
              description: null,
              users: null,
              last_active: null,
              last_edited: null,
              cutoff
            }
          ]
        }
      };
    } else {
      throw Error("account_id or license_id must be specified");
    }
  }

  async search(): Promise<void> {
    this.status_mesg("Searching...");
    const q = this.query();
    const table = keys(q.query)[0];
    const projects: Project[] = (await query(q)).query[table];
    if (!this.mounted) {
      return;
    }
    if (!projects) {
      this.status_mesg("ERROR");
      return;
    }
    projects.sort(
      (a, b) =>
        -cmp(
          project_sort_key(a, this.props.account_id),
          project_sort_key(b, this.props.account_id)
        )
    );
    this.status_mesg("");
    this.setState({ projects: projects });
  }

  render_number_of_projects(): Rendered {
    if (!this.state.projects) {
      return;
    }
    return <span>({this.state.projects.length})</span>;
  }
  render_projects(): Rendered {
    if (!this.state.projects) {
      return <Loading />;
    }

    if (this.state.projects.length == 0) {
      return <div>No projects</div>;
    }

    const v: Rendered[] = [this.render_header()];

    let project: Project;
    let i = 0;
    for (project of this.state.projects) {
      const style = i % 2 ? { backgroundColor: "#f8f8f8" } : undefined;
      i += 1;

      v.push(this.render_project(project, style));
    }
    return <div>{v}</div>;
  }

  render_last_active(project: Project): Rendered {
    if (!this.props.account_id) {
      return <TimeAgo date={project.last_edited} />;
    }
    if (project.last_active && project.last_active[this.props.account_id]) {
      return <TimeAgo date={project.last_active[this.props.account_id]} />;
    }
    return <span />;
  }

  render_description(project: Project): Rendered {
    if (project.description == "No Description") {
      return;
    }
    return <span>{trunc_middle(project.description, 60)}</span>;
  }

  open_project(project_id: string): void {
    const projects: any = redux.getActions("projects"); // todo: any?
    projects.open_project({ project_id: project_id, switch_to: true });
  }

  render_project(project: Project, style?: React.CSSProperties): Rendered {
    return (
      <Row key={project.project_id} style={style}>
        <Col md={4}>
          <a
            style={{ cursor: "pointer" }}
            onClick={() => this.open_project(project.project_id)}
          >
            {trunc_middle(project.title, 60)}
          </a>
        </Col>
        <Col md={4}>{this.render_description(project)}</Col>
        <Col md={4}>{this.render_last_active(project)}</Col>
      </Row>
    );
  }

  render_header(): Rendered {
    return (
      <Row key="header" style={{ fontWeight: "bold", color: "#666" }}>
        <Col md={4}>Title</Col>
        <Col md={4}>Description</Col>
        <Col md={4}>Active</Col>
      </Row>
    );
  }

  render(): Rendered {
    const content = this.state.status ? (
      this.state.status
    ) : (
      <span>
        {this.props.title} {this.render_number_of_projects()}
      </span>
    );
    const title = (
      <span style={{ fontWeight: "bold", color: "#666" }}>{content}</span>
    );
    return <Panel header={title}>{this.render_projects()}</Panel>;
  }
}
