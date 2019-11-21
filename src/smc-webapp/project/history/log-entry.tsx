import * as misc from "smc-util/misc";
import * as React from "react";

import * as lodash from "lodash";
const TRUNC = 90;

import { Rendered, redux } from "../../app-framework";

import { Grid, Col, Row } from "react-bootstrap";

import { Icon, TimeAgo, PathLink, r_join, Space, Tip } from "../../r_misc";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { User } = require("../../users");
import { file_actions } from "../../project_store";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ProjectTitleAuto } = require("../../projects");
import { file_associations } from "../../file-associations";
import { SystemProcess } from "./system-process";
import { UserMap } from "smc-webapp/todo-types";

import {
  ProjectEvent,
  OpenFile,
  ProjectControlEvent,
  MiniTermEvent,
  FileActionEvent,
  X11Event,
  LibraryEvent,
  AssistantEvent,
  UpgradeEvent,
  CollaboratorEvent,
  SystemEvent
} from "./types";

const selected_item: React.CSSProperties = {
  backgroundColor: "#08c",
  color: "white"
};

const file_action_icons = {
  deleted: "delete",
  downloaded: "download",
  moved: "move",
  copied: "copy",
  share: "shared",
  uploaded: "upload"
};

interface Props {
  id: string;
  time: object;
  event: ProjectEvent | string;
  account_id: string;
  user_map?: UserMap;
  cursor: boolean;
  backgroundStyle?: React.CSSProperties;
  project_id: string;
}

function TookTime({
  ms,
  display = "seconds"
}: {
  ms?: number;
  display?: "seconds";
}): JSX.Element | null {
  if (ms == undefined) {
    return null;
  }
  let description = `${ms}ms`;

  if (display == "seconds") {
    description = `${(Math.round(ms / 100) / 10).toFixed(1)}s`;
  }

  return <span style={{ color: "#666" }}>(took {description})</span>;
}

export class LogEntry extends React.Component<Props> {
  // Trade-off! Most log entries are never updated
  shouldComponentUpdate(next: Props): boolean {
    return (
      next.id !== this.props.id ||
      next.user_map !== this.props.user_map ||
      next.backgroundStyle !== this.props.backgroundStyle
    );
  }

  render_open_file(event: OpenFile): JSX.Element {
    return (
      <span>
        opened
        <Space />
        <PathLink
          path={event.filename}
          full={true}
          style={this.props.cursor ? selected_item : undefined}
          trunc={TRUNC}
          project_id={this.props.project_id}
        />
        <TookTime ms={event.time} />
      </span>
    );
  }

  render_start_project(event: ProjectControlEvent): JSX.Element {
    return (
      <span>
        started this project <TookTime ms={event.time} />
      </span>
    );
  }

  render_project_restart_requested(): JSX.Element {
    return <span>requested to restart this project</span>;
  }

  render_project_stop_requested(): JSX.Element {
    return <span>requested to stop this project</span>;
  }

  render_project_stopped(): JSX.Element {
    return <span>stopped this project</span>;
  }

  render_miniterm_command(cmd: string): JSX.Element {
    if (cmd.length > 50) {
      return (
        <Tip title="Full command" tip={cmd} delayHide={10000} rootClose={true}>
          <kbd>{misc.trunc_middle(cmd, TRUNC)}</kbd>
        </Tip>
      );
    } else {
      return <kbd>{cmd}</kbd>;
    }
  }

  render_miniterm(event: MiniTermEvent): JSX.Element {
    return (
      <span>
        executed mini terminal command{" "}
        {this.render_miniterm_command(event.input)}
      </span>
    );
  }

  project_title(event: { project: string }): JSX.Element {
    return (
      <ProjectTitleAuto
        style={this.props.cursor ? selected_item : undefined}
        project_id={event.project}
      />
    );
  }

  file_link(
    path: string,
    link: boolean,
    i: number,
    project_id?: string
  ): JSX.Element {
    return (
      <PathLink
        path={path}
        full={true}
        style={this.props.cursor ? selected_item : undefined}
        key={i}
        trunc={TRUNC}
        link={link}
        project_id={project_id != null ? project_id : this.props.project_id}
      />
    );
  }

  multi_file_links(event: { files: string[] }, link?: boolean): Rendered[] {
    if (link == null) {
      link = true;
    }
    const links: Rendered[] = [];
    for (let i = 0; i < event.files.length; i++) {
      const path = event.files[i];
      links.push(this.file_link(path, link, i));
    }
    return r_join(links);
  }

  to_link(event: { project?: string; dest?: string }): React.ReactNode {
    if (event.project != undefined) {
      return this.project_title({ project: event.project });
    } else if (event.dest != null) {
      return this.file_link(event.dest, true, 0);
    } else {
      return "???";
    }
  }

  render_file_action(e: FileActionEvent): JSX.Element {
    switch (e.action) {
      case "deleted":
        return (
          <span>
            deleted {this.multi_file_links(e, false)}{" "}
            {e.count != null ? `(${e.count} total)` : ""}
          </span>
        );
      case "downloaded":
        return (
          <span>
            downloaded{" "}
            {this.file_link(e.path != null ? e.path : e.files[0], true, 0)}{" "}
            {e.count != null ? `(${e.count} total)` : ""}
          </span>
        );
      case "moved":
        return (
          <span>
            moved {this.multi_file_links(e, false)}{" "}
            {e.count != null ? `(${e.count} total)` : ""} to {this.to_link(e)}
          </span>
        );
      case "copied":
        return (
          <span>
            copied {this.multi_file_links(e)}{" "}
            {e.count != null ? `(${e.count} total)` : ""} to {this.to_link(e)}
          </span>
        );
      case "shared":
        return (
          <span>
            shared {this.multi_file_links(e)}{" "}
            {e.count != null ? `(${e.count} total)` : ""}
          </span>
        );
      case "uploaded":
        return <span>uploaded {this.file_link(e.file, true, 0)}</span>;
    }
  }

  click_set(e: React.SyntheticEvent): void {
    e.preventDefault();
    redux
      .getActions({ project_id: this.props.project_id })
      .set_active_tab("settings");
  }

  render_set(obj: any): Rendered[] {
    let i = 0;
    const result: JSX.Element[] = [];
    for (const key in obj) {
      const value = obj[key];
      i += 1;
      let content = `${key} to ${value}`;
      if (i < obj.length) {
        content += "<Space/>and";
      }
      result.push(
        <span key={i}>
          set{" "}
          <a
            onClick={this.click_set}
            style={this.props.cursor ? selected_item : undefined}
            href=""
          >
            {content}
          </a>
        </span>
      );
    }
    return result;
  }

  render_x11(event: X11Event): Rendered {
    if (event.action !== "launch") {
      return;
    }
    return (
      <span>
        launched X11 app <code>{event.command}</code> in{" "}
        {this.file_link(event.path, true, 0)}
      </span>
    );
  }

  render_library(event: LibraryEvent): Rendered {
    if (event.target == null) {
      return;
    }
    return (
      <span>
        copied &quot;{event.title}&quot; from the library to{" "}
        {this.file_link(event.target, true, 0)}
      </span>
    );
  }

  render_assistant(event: AssistantEvent): Rendered {
    switch (event.action) {
      case "insert":
        const lang = misc.jupyter_language_to_name(event.lang);
        return (
          <span>
            used the <i>assistant</i> to insert the &quot;{lang}&quot; example{" "}
            {'"'}
            {event.entry.join(" → ")}
            {'"'}
            {" into "}
            <PathLink
              path={event.path}
              full={true}
              style={this.props.cursor ? selected_item : undefined}
              trunc={TRUNC}
              project_id={this.props.project_id}
            />
          </span>
        );
    }
  }

  render_upgrade(event: UpgradeEvent): Rendered {
    const { params } = require("smc-util/schema").PROJECT_UPGRADES;
    const v: JSX.Element[] = [];
    for (const param in event.upgrades) {
      const val = event.upgrades[param];
      const factor =
        (params[param] != null ? params[param].display_factor : undefined) !=
        null
          ? params[param] != null
            ? params[param].display_factor
            : undefined
          : 1;
      const unit =
        (params[param] != null ? params[param].display_unit : undefined) != null
          ? params[param] != null
            ? params[param].display_unit
            : undefined
          : "upgrade";
      const display =
        (params[param] != null ? params[param].display : undefined) != null
          ? params[param] != null
            ? params[param].display
            : undefined
          : "Upgrade";
      const n = misc.round1(val != null ? factor * val : 0);
      v.push(
        <span key={param}>
          {display}: {n} {misc.plural(n, unit)}
        </span>
      );
    }
    const destination = v.length > 0 ? r_join(v) : "nothing";
    return (
      <span>
        set{" "}
        <a
          onClick={this.click_set}
          style={this.props.cursor ? selected_item : undefined}
          href=""
        >
          upgrade contributions
        </a>{" "}
        to: {destination}
      </span>
    );
  }

  render_invite_user(event: CollaboratorEvent): JSX.Element {
    return (
      <span>
        invited user{" "}
        <User
          user_map={this.props.user_map}
          account_id={event.invitee_account_id}
        />
      </span>
    );
  }

  render_invite_nonuser(event: CollaboratorEvent): JSX.Element {
    return <span>invited nonuser {event.invitee_email}</span>;
  }

  render_remove_collaborator(event: CollaboratorEvent): JSX.Element {
    return <span>removed collaborator {event.removed_name}</span>;
  }

  render_desc(): Rendered | Rendered[] {
    if (typeof this.props.event === "string") {
      return <span>{this.props.event}</span>;
    }

    switch (this.props.event.event) {
      case "start_project":
        return this.render_start_project(this.props.event);
      case "project_stop_requested":
        return this.render_project_stop_requested();
      case "project_restart_requested":
        return this.render_project_restart_requested();
      case "project_stopped":
        return this.render_project_stopped();
      case "open": // open a file
        return this.render_open_file(this.props.event);
      case "set":
        return this.render_set(misc.copy_without(this.props.event, "event"));
      case "miniterm":
        return this.render_miniterm(this.props.event);
      case "termInSearch":
        return this.render_miniterm(this.props.event);
      case "file_action":
        return this.render_file_action(this.props.event);
      case "upgrade":
        return this.render_upgrade(this.props.event);
      case "invite_user":
        return this.render_invite_user(this.props.event);
      case "invite_nonuser":
        return this.render_invite_nonuser(this.props.event);
      case "remove_collaborator":
        return this.render_remove_collaborator(this.props.event);
      case "open_project": // not used anymore???
        return <span>opened this project</span>;
      case "library":
        return this.render_library(this.props.event);
      case "assistant":
        return this.render_assistant(this.props.event);
      case "x11":
        return this.render_x11(this.props.event);
    }
  }
  // ignore unknown -- would just look mangled to user...
  //else
  // FUTURE:
  //    return <span>{misc.to_json(@props.event)}</span>

  render_user(): JSX.Element {
    if (this.props.account_id != null) {
      return (
        <User
          user_map={this.props.user_map}
          account_id={this.props.account_id}
        />
      );
    } else {
      return <SystemProcess event={this.props.event as SystemEvent} />;
    }
  }

  icon(): string {
    if (typeof this.props.event === "string" || this.props.event == undefined) {
      return "dot-circle-o";
    }

    switch (this.props.event.event) {
      case "open_project":
        return "folder-open-o";
      case "open": // open a file
        const ext = misc.filename_extension(this.props.event.filename);
        let x = file_associations[ext].icon;
        if (x != undefined) {
          if (x.slice(0, 3) === "fa-") {
            // temporary -- until change code there?
            x = x.slice(3);
          }
          return x;
        } else {
          return "file-code-o";
        }
      case "set":
        return "wrench";
      case "file_action":
        const icon = file_action_icons[this.props.event.action];
        return file_actions[icon] != null ? file_actions[icon].icon : undefined;
      case "upgrade":
        return "arrow-circle-up";
      case "invite_user":
        return "user";
      case "invite_nonuser":
        return "user";
    }

    if (this.props.event.event.indexOf("project") !== -1) {
      return "edit";
    } else {
      return "dot-circle-o";
    }
  }

  render(): JSX.Element {
    const style = this.props.cursor
      ? selected_item
      : this.props.backgroundStyle;
    return (
      <Grid fluid={true} style={{ width: "100%" }}>
        <Row
          style={lodash.extend({ borderBottom: "1px solid lightgrey" }, style)}
        >
          <Col sm={1} style={{ textAlign: "center" }}>
            <Icon name={this.icon()} style={style} />
          </Col>
          <Col sm={11}>
            {this.render_user()}
            <Space />
            {this.render_desc()}
            <Space />
            <TimeAgo style={style} date={this.props.time} popover={true} />
          </Col>
        </Row>
      </Grid>
    );
  }
}
