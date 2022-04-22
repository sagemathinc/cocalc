/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as misc from "@cocalc/util/misc";
import React from "react";
const TRUNC = 90;
import { Rendered, redux } from "../../app-framework";
import { Grid, Col, Row } from "react-bootstrap";
import {
  Icon,
  IconName,
  TimeAgo,
  PathLink,
  r_join,
  Space,
  Tip,
} from "../../components";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { User } = require("../../users");
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { ProjectTitle } from "../../projects/project-title";
import { file_associations } from "../../file-associations";
import { SystemProcess } from "./system-process";
import { UserMap } from "@cocalc/frontend/todo-types";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { round1 } from "@cocalc/util/misc";
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
  LicenseEvent,
  CollaboratorEvent,
  SystemEvent,
  PublicPathEvent,
} from "./types";
import { FILE_ACTIONS } from "../../project_actions";

const selected_item: React.CSSProperties = {
  backgroundColor: "#08c",
  color: "white",
};

// this is a dictionary for FILE_ACTIONS in packages/frontend/project_actions.ts
const file_action_icons: {
  [key in FileActionEvent["action"]]: keyof typeof FILE_ACTIONS;
} = {
  deleted: "delete",
  downloaded: "download",
  moved: "move",
  renamed: "rename",
  copied: "copy",
  shared: "share",
  uploaded: "upload",
  created: "create",
};

interface Props {
  id: string;
  time: Date;
  event: ProjectEvent | string;
  account_id: string;
  user_map?: UserMap;
  cursor: boolean;
  backgroundStyle?: React.CSSProperties;
  project_id: string;
}

function TookTime({
  ms,
  display = "seconds",
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

function areEqual(prev: Props, next: Props): boolean {
  // Optimization/Trade-off: Most log entries are never updated
  return (
    prev.id == next.id &&
    prev.user_map == next.user_map &&
    prev.cursor == next.cursor
  );
}

export const LogEntry: React.FC<Props> = React.memo((props) => {
  function render_open_file(event: OpenFile): JSX.Element {
    return (
      <span>
        opened
        <Space />
        <PathLink
          path={event.filename}
          full={true}
          style={props.cursor ? selected_item : undefined}
          trunc={TRUNC}
          project_id={props.project_id}
        />{" "}
        <TookTime ms={event.time} />
      </span>
    );
  }

  function render_public_path(event: PublicPathEvent): JSX.Element {
    return (
      <span>
        set the public path
        <Space />
        <PathLink
          path={event.path}
          full={true}
          style={props.cursor ? selected_item : undefined}
          trunc={TRUNC}
          project_id={props.project_id}
        />{" "}
        to be {event.disabled ? "disabled" : "enabled"}
        {" and "}
        {event.unlisted ? "unlisted" : "listed"}
      </span>
    );
  }

  function render_start_project(event: ProjectControlEvent): JSX.Element {
    return (
      <span>
        started this project <TookTime ms={event.time} />
      </span>
    );
  }

  function render_project_restart_requested(): JSX.Element {
    return <span>requested to restart this project</span>;
  }

  function render_project_stop_requested(): JSX.Element {
    return <span>requested to stop this project</span>;
  }

  function render_project_start_requested(): JSX.Element {
    return <span>requested to start this project</span>;
  }

  function render_project_started(): JSX.Element {
    return <span>started this project</span>;
  }

  function render_project_stopped(): JSX.Element {
    return <span>stopped this project</span>;
  }

  function render_miniterm_command(cmd: string): JSX.Element {
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

  function render_miniterm(event: MiniTermEvent): JSX.Element {
    return (
      <span>
        executed mini terminal command {render_miniterm_command(event.input)}
      </span>
    );
  }

  function project_title(event: { project: string }): JSX.Element {
    return (
      <ProjectTitle
        style={props.cursor ? selected_item : undefined}
        project_id={event.project}
      />
    );
  }

  function file_link(
    path: string,
    link: boolean,
    i: number,
    project_id?: string
  ): JSX.Element {
    return (
      <PathLink
        path={path}
        full={true}
        style={props.cursor ? selected_item : undefined}
        key={i}
        trunc={TRUNC}
        link={link}
        project_id={project_id != null ? project_id : props.project_id}
      />
    );
  }

  function multi_file_links(
    event: { files: string | string[] },
    link?: boolean
  ) {
    if (link == null) {
      link = true;
    }
    // due to a bug, "files" could just be a string
    if (typeof event.files === "string") {
      event.files = [event.files];
    }
    if (
      event.files.length == 1 &&
      event.files[0][event.files[0].length - 1] == "/"
    ) {
      return <>the directory {file_link(event.files[0], link, 0)}</>;
    }
    const links: Rendered[] = [];
    for (let i = 0; i < event.files.length; i++) {
      const path = event.files[i];
      links.push(file_link(path, link, i));
    }
    return r_join(links);
  }

  function to_link(event: { project?: string; dest?: string }) {
    if (event.project != undefined && event.dest != null) {
      return (
        <>
          {file_link(event.dest, true, 0, event.project)} in the project{" "}
          {project_title({ project: event.project })}
        </>
      );
    } else if (event.project != undefined) {
      return project_title({ project: event.project });
    } else if (event.dest != null) {
      return file_link(event.dest, true, 0);
    } else {
      return "???";
    }
  }

  function render_file_action(e: FileActionEvent): JSX.Element {
    switch (e.action) {
      case "deleted":
        return (
          <span>
            deleted {multi_file_links(e, true)}{" "}
            {e.count != null ? `(${e.count} total)` : ""}
          </span>
        );
      case "downloaded":
        return (
          <span>
            downloaded {multi_file_links(e, true)}{" "}
            {e.count != null ? `(${e.count} total)` : ""}
          </span>
        );
      case "moved":
        return (
          <span>
            moved {multi_file_links(e, false)}{" "}
            {e.count != null ? `(${e.count} total)` : ""} to {to_link(e)}
          </span>
        );
      case "renamed":
        return (
          <span>
            renamed {file_link(e.src, false, 0)} to {file_link(e.dest, true, 1)}
          </span>
        );
      case "copied":
        return (
          <span>
            copied {multi_file_links(e)}{" "}
            {e.count != null ? `(${e.count} total)` : ""} to {to_link(e)}
          </span>
        );
      case "shared":
        return (
          <span>
            shared {multi_file_links(e)}{" "}
            {e.count != null ? `(${e.count} total)` : ""}
          </span>
        );
      case "uploaded":
        return <span>uploaded {file_link(e.file, true, 0)}</span>;
      case "created":
        return <span>created {multi_file_links(e)}</span>;
    }
  }

  function click_set(e: React.SyntheticEvent): void {
    e.preventDefault();
    redux
      .getActions({ project_id: props.project_id })
      .set_active_tab("settings");
  }

  function render_set(obj: any): Rendered[] {
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
            onClick={click_set}
            style={props.cursor ? selected_item : undefined}
            href=""
          >
            {content}
          </a>
        </span>
      );
    }
    return result;
  }

  function render_x11(event: X11Event): Rendered {
    if (event.action !== "launch") {
      return;
    }
    return (
      <span>
        launched X11 app <code>{event.command}</code> in{" "}
        {file_link(event.path, true, 0)}
      </span>
    );
  }

  function render_library(event: LibraryEvent): Rendered {
    if (event.target == null) {
      return;
    }
    return (
      <span>
        copied &quot;{event.title}&quot; from the library to{" "}
        {file_link(event.target, true, 0)}
      </span>
    );
  }

  function render_assistant(event: AssistantEvent): Rendered {
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
              style={props.cursor ? selected_item : undefined}
              trunc={TRUNC}
              project_id={props.project_id}
            />
          </span>
        );
    }
  }

  function render_upgrade(event: UpgradeEvent): Rendered {
    const { params } = require("@cocalc/util/schema").PROJECT_UPGRADES;
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
      if (n == 0) continue;
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
          onClick={click_set}
          style={props.cursor ? selected_item : undefined}
          href=""
        >
          upgrade contributions
        </a>{" "}
        to: {destination}
      </span>
    );
  }

  function render_license(event: LicenseEvent): Rendered {
    return (
      <span>
        {event.action == "add" ? "added" : "removed"} license{" "}
        {event.title ? `"${event.title}"` : ""} with key ending in "
        {event.license_id?.slice(36 - 13, 36)}" for{" "}
        {event.quota ? describe_quota(event.quota) : "upgrades"}
      </span>
    );
  }

  function render_invite_user(event: CollaboratorEvent): JSX.Element {
    return (
      <span>
        invited user{" "}
        <User user_map={props.user_map} account_id={event.invitee_account_id} />
      </span>
    );
  }

  function render_invite_nonuser(event: CollaboratorEvent): JSX.Element {
    return <span>invited nonuser {event.invitee_email}</span>;
  }

  function render_remove_collaborator(event: CollaboratorEvent): JSX.Element {
    return <span>removed collaborator {event.removed_name}</span>;
  }

  function render_desc(): Rendered | Rendered[] {
    if (typeof props.event === "string") {
      return <span>{props.event}</span>;
    }

    switch (props.event.event) {
      case "start_project":
        return render_start_project(props.event);
      case "project_stop_requested":
        return render_project_stop_requested();
      case "project_stopped":
        return render_project_stopped();
      case "project_start_requested":
        return render_project_start_requested();
      case "project_started":
        return render_project_started();
      case "project_restart_requested":
        return render_project_restart_requested();
      case "open": // open a file
        return render_open_file(props.event);
      case "set":
        return render_set(misc.copy_without(props.event, "event"));
      case "miniterm":
        return render_miniterm(props.event);
      case "termInSearch":
        return render_miniterm(props.event);
      case "file_action":
        return render_file_action(props.event);
      case "upgrade":
        return render_upgrade(props.event);
      case "license":
        return render_license(props.event);
      case "invite_user":
        return render_invite_user(props.event);
      case "invite_nonuser":
        return render_invite_nonuser(props.event);
      case "remove_collaborator":
        return render_remove_collaborator(props.event);
      case "open_project": // not used anymore???
        return <span>opened this project</span>;
      case "library":
        return render_library(props.event);
      case "assistant":
        return render_assistant(props.event);
      case "x11":
        return render_x11(props.event);
      case "delete_project":
        return <span>deleted the project</span>;
      case "undelete_project":
        return <span>undeleted the project</span>;
      case "hide_project":
        return <span>hid the project from themself</span>;
      case "unhide_project":
        return <span>unhid the project from themself</span>;
      case "public_path":
        return render_public_path(props.event);
      default:
        return <span>Unknown event: {JSON.stringify(props.event)}</span>;
    }
  }
  // ignore unknown -- would just look mangled to user...
  //else
  // FUTURE:
  //    return <span>{misc.to_json(@props.event)}</span>

  function render_user(): JSX.Element {
    if (props.account_id != null) {
      return <User user_map={props.user_map} account_id={props.account_id} />;
    } else {
      return <SystemProcess event={props.event as SystemEvent} />;
    }
  }

  function icon(): IconName {
    if (typeof props.event === "string" || props.event == undefined) {
      return "dot-circle";
    }

    switch (props.event.event) {
      case "open_project":
        return "folder-open";
      case "open": // open a file
        const ext = misc.filename_extension(props.event.filename);
        const info = file_associations[ext];
        if (info == null) return "file-code";
        let x = info.icon;
        if (x != undefined) {
          return x;
        } else {
          return "file-code";
        }
      case "set":
        return "wrench";
      case "file_action":
        const action_name = file_action_icons[props.event.action];
        return FILE_ACTIONS[action_name].icon;
      case "upgrade":
        return "arrow-circle-up";
      case "invite_user":
        return "user";
      case "invite_nonuser":
        return "user";
    }

    if (props.event.event.indexOf("project") !== -1) {
      return "edit";
    } else {
      return "dot-circle";
    }
  }

  function renderDuration() {
    if (typeof props.event != "string" && props.event["duration_ms"] != null) {
      return (
        <>
          {" "}
          (time = {round1(
            (props.event["duration_ms"] ?? 0) / 1000
          )} seconds){" "}
        </>
      );
    }
  }

  const style = props.cursor ? selected_item : props.backgroundStyle;
  return (
    <Grid fluid={true} style={{ width: "100%" }}>
      <Row style={style}>
        <Col sm={1} style={{ textAlign: "center" }}>
          <Icon name={icon()} style={style} />
        </Col>
        <Col sm={11}>
          {render_user()}
          <Space />
          {render_desc()}
          {renderDuration()}
          <Space />
          <TimeAgo style={style} date={props.time} popover={true} />
        </Col>
      </Row>
    </Grid>
  );
}, areEqual);
