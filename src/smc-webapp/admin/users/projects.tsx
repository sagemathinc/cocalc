import {
  React,
  Component,
  Rendered
} from "smc-webapp/frame-editors/generic/react";

import { cmp } from "smc-webapp/frame-editors/generic/misc";

const { Loading, TimeAgo } = require("smc-webapp/r_misc");

import { query } from "smc-webapp/frame-editors/generic/client";

import { Row, Col } from "react-bootstrap";

const { Panel } = require("react-bootstrap"); // fighting with stupid typescript declarations!

interface Project {
  project_id: string;
  title: string;
  description: string;
  users: Map<string, any>;
  last_active: Map<string, any>;
  last_edited: any;
}

interface Props {
  account_id: string;
}

interface State {
  status?: string;
  projects?: Project[];
}

function project_sort_key(project: Project, account_id: string): string {
  if (project.last_active && project.last_active[account_id]) {
    return project.last_active[account_id];
  }
  /* if (project.last_edited) {
    return project.last_edited;
  }*/
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

  status_mesg(s: string): void {
    this.setState({
      status: s
    });
  }

  //smc.client.query({query:{projects:[{title:null}]}, cb:console.log, options:[{account_id:"42d15466-d07a-4a37-b499-95bb9b4e60da"}] })
  async search(): Promise<void> {
    this.status_mesg("Searching...");
    const projects: Project[] = (await query({
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
    })).query.projects;
    if (!this.mounted) {
      return;
    }
    if (!projects) {
      this.status_mesg("ERROR");
      return;
    }
    (window as any).projects = projects;
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

  render_projects(): Rendered {
    if (!this.state.projects) {
      return <Loading />;
    }

    if (this.state.projects.length == 0) {
      return <div>No projects</div>;
    }

    const v: Rendered[] = [this.render_header()];

    let project: Project;
    for (project of this.state.projects) {
      v.push(this.render_project(project));
    }
    return <div>{v}</div>;
  }

  render_last_active(project : Project) : Rendered {
    if (project.last_active && project.last_active[this.props.account_id]) {
      return <TimeAgo date={project.last_active[this.props.account_id]} />
    }
    return <span></span>
  }

  render_description(project: Project) : Rendered {
    if (project.description == 'No Description') {
      return;
    }
    return <span>project.description</span>;
  }

  render_project(project: Project): Rendered {
    return (
      <Row key={project.project_id}>
        <Col md={2}>{project.title}</Col>
        <Col md={2}>{this.render_description(project)}</Col>
        <Col md={2}>
          {this.render_last_active(project)}
        </Col>
      </Row>
    );
  }

  render_header(): Rendered {
    return (
      <Row key="header" style={{ fontWeight: "bold", color: "#666" }}>
        <Col md={2}>Title</Col>
      </Row>
    );
  }

  render(): Rendered {
    return <Panel header={"Projects"}>{this.render_projects()}</Panel>;
  }
}
