/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Show a table with links to recently used projects (with most recent first) that

 - account_id: have a given account_id as collaborator; here we
               show only the most recently used projects by them,
               not everything. This is sorted by when *they* used
               it last.

*/

import { Component, Rendered } from "@cocalc/frontend/app-framework";
import { cmp, keys, trunc_middle } from "@cocalc/util/misc";
import { Loading, TimeAgo } from "@cocalc/frontend/components";
import { query } from "@cocalc/frontend/frame-editors/generic/client";
import { Card } from "antd";
import { Row, Col } from "@cocalc/frontend/antd-bootstrap";
import { FormattedMessage } from "react-intl";
import { labels } from "@cocalc/frontend/i18n";

interface Project {
  project_id: string;
  title: string;
  description: string;
  users: Map<string, any>;
  last_active: Map<string, any>;
  last_edited: Date;
}

interface Props {
  account_id?: string; // account_id must be given
  title?: string | Rendered; // Defaults to "Projects"
}

interface State {
  status?: string;
  projects?: Project[]; // actual information about the projects
}

function project_sort_key(
  project: Project,
  account_id?: string,
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

  UNSAFE_componentWillMount(): void {
    this.mounted = true;
    this.update_search();
  }

  componentWillUnmount(): void {
    this.mounted = false;
  }

  componentDidUpdate(prevProps) {
    if (this.props.account_id != prevProps.account_id) {
      this.update_search();
    }
  }

  status_mesg(s: string): void {
    this.setState({
      status: s,
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
              last_edited: null,
            },
          ],
        },
        options: [{ account_id: this.props.account_id }],
      };
    } else {
      throw Error("account_id must be specified");
    }
  }

  async update_search(): Promise<void> {
    try {
      await this.load_projects();
    } catch (err) {
      this.status_mesg(`ERROR -- ${err}`);
    }
  }

  // Load the projects
  async load_projects(): Promise<void> {
    this.status_mesg("Loading projects...");
    const q = this.query();
    const table = keys(q.query)[0];
    const projects: Project[] = (await query(q)).query[table];
    if (!this.mounted) {
      return;
    }
    projects.sort(
      (a, b) =>
        -cmp(
          project_sort_key(a, this.props.account_id),
          project_sort_key(b, this.props.account_id),
        ),
    );
    this.status_mesg("");
    this.setState({ projects });
  }

  render_projects(): Rendered {
    if (!this.state.projects) {
      return <Loading />;
    }

    if (this.state.projects.length == 0) {
      return (
        <div>
          <FormattedMessage
            id="admin.users.projects.none"
            defaultMessage="No {projectsLabel}"
            values={{ projectsLabel: <FormattedMessage {...labels.projects} /> }}
          />
        </div>
      );
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

  render_project(project: Project, style?: React.CSSProperties): Rendered {
    return (
      <Row key={project.project_id} style={style}>
        <Col md={4}>{trunc_middle(project.title, 60)}</Col>
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
        {this.props.title}
      </span>
    );
    const title = (
      <div style={{ fontWeight: "bold", color: "#666", width: "100%" }}>
        {content}
      </div>
    );
    return <Card title={title}>{this.render_projects()}</Card>;
  }
}
