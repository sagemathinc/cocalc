/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { Space, Tooltip } from "antd";
import React from "react";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { Col, Grid, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  redux,
  Rendered,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Gap,
  Icon,
  IconName,
  PathLink,
  r_join,
  TimeAgo,
  Tip,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import ComputeLogEntry from "@cocalc/frontend/compute/log-entry";
import ComputeServerTag from "@cocalc/frontend/compute/server-tag";
import { SoftwareEnvironments } from "@cocalc/frontend/customize";
import { file_associations } from "@cocalc/frontend/file-associations";
import { modelToName } from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { labels } from "@cocalc/frontend/i18n";
import { FILE_ACTIONS } from "@cocalc/frontend/project_actions";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { DisplayProjectQuota } from "@cocalc/frontend/purchases/purchases";
import { UserMap } from "@cocalc/frontend/todo-types";
import track from "@cocalc/frontend/user-tracking";
import { describe_quota } from "@cocalc/util/licenses/describe-quota";
import * as misc from "@cocalc/util/misc";
import { round1 } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FormattedMessage, useIntl } from "react-intl";
import { SOFTWARE_ENVIRONMENT_ICON } from "../settings/software-consts";
import { SystemProcess } from "./system-process";
import type {
  AssistantEvent,
  CollaboratorEvent,
  FileActionEvent,
  LibraryEvent,
  LicenseEvent,
  LLMEvent,
  MiniTermEvent,
  OpenFile,
  PayAsYouGoUpgradeEvent,
  ProjectControlEvent,
  ProjectEvent,
  PublicPathEvent,
  SoftwareEnvironmentEvent,
  SystemEvent,
  UpgradeEvent,
  X11Event,
} from "./types";
import { isUnknownEvent } from "./types";

const TRUNC = 90;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { User } = require("@cocalc/frontend/users");

const selected_item: CSS = {
  backgroundColor: "#08c",
  color: "white",
} as const;

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
  time?: Date;
  event: ProjectEvent | string;
  account_id: string;
  user_map?: UserMap;
  cursor?: boolean;
  backgroundStyle?: CSS;
  project_id: string;
  mode?: "full" | "flyout";
  flyoutExtra?: boolean;
}

function TookTime({
  ms,
  display = "seconds",
}: {
  ms?: number;
  display?: "seconds";
}): React.JSX.Element | null {
  if (ms == undefined) {
    return null;
  }
  let description = `${ms}ms`;

  if (display == "seconds" && ms >= 1000) {
    description = `${(Math.round(ms / 100) / 10).toFixed(1)}s`;
  }

  return <span style={{ color: COLORS.GRAY_M }}>(took {description})</span>;
}

function areEqual(prev: Props, next: Props): boolean {
  // Optimization/Trade-off: Most log entries are never updated
  return (
    prev.id == next.id &&
    prev.user_map == next.user_map &&
    prev.cursor == next.cursor &&
    prev.backgroundStyle == next.backgroundStyle
  );
}

export const LogEntry: React.FC<Props> = React.memo(
  (props: Readonly<Props>) => {
    const {
      event,
      account_id,
      user_map,
      cursor = false,
      project_id,
      backgroundStyle,
      mode = "full",
      flyoutExtra = false,
    } = props;

    const intl = useIntl();

    const software_envs: SoftwareEnvironments | null = useTypedRedux(
      "customize",
      "software",
    );

    function render_open_file(event: OpenFile): React.JSX.Element {
      return (
        <span>
          Opened
          <Gap />
          <PathLink
            path={event.filename}
            full={true}
            style={cursor ? selected_item : undefined}
            trunc={TRUNC}
            project_id={project_id}
            onOpen={() =>
              track("open-file", {
                how: "project-log",
                type: "open_file",
                path: event.filename,
                project_id,
              })
            }
          />{" "}
          <TookTime ms={event.time} />
          {event.deleted && (
            <>
              {" "}
              (file was deleted <TimeAgo date={event.deleted} />)
            </>
          )}
        </span>
      );
    }

    function render_public_path(event: PublicPathEvent): React.JSX.Element {
      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.public_path"
            defaultMessage={`set the public path {gap} {path} to be {event} and {listed} {license}`}
            values={{
              gap: <Gap />,
              path: (
                <PathLink
                  path={event.path}
                  full={true}
                  style={cursor ? selected_item : undefined}
                  trunc={TRUNC}
                  project_id={project_id}
                />
              ),
              event: event.disabled ? "disabled" : "enabled",
              listed: event.unlisted ? "unlisted" : "listed",
              license: event.site_license_id
                ? ` and license id ...${event.site_license_id}`
                : "",
            }}
          />
        </span>
      );
    }

    function render_software_environment(
      event: SoftwareEnvironmentEvent,
    ): React.JSX.Element {
      const envs = software_envs?.get("environments");
      const prev: string = envs
        ? (envs.get(event.previous)?.get("title") ?? event.previous)
        : intl.formatMessage(labels.loading);
      const next: string = envs
        ? (envs.get(event.next)?.get("title") ?? event.next)
        : intl.formatMessage(labels.loading);

      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.software"
            defaultMessage={`changed the software environment from {prev} to {next}`}
            values={{ prev, next }}
          />
        </span>
      );
    }

    function render_start_project(
      event: ProjectControlEvent,
    ): React.JSX.Element {
      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.start_project"
            defaultMessage={`started this project {time}`}
            values={{ time: <TookTime ms={event.time} /> }}
          />
        </span>
      );
    }

    function render_project_restart_requested(): React.JSX.Element {
      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.request_restart_project"
            defaultMessage={`requested to restart this project`}
          />
        </span>
      );
    }

    function render_project_stop_requested(): React.JSX.Element {
      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.request_stop_project"
            defaultMessage={`requested to stop this project`}
          />
        </span>
      );
    }

    function render_project_start_requested(): React.JSX.Element {
      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.request_start_project"
            defaultMessage={`requested to start this project`}
          />
        </span>
      );
    }

    function render_project_started(): React.JSX.Element {
      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.project_started"
            defaultMessage={`started this project`}
          />
        </span>
      );
    }

    function render_project_stopped(): React.JSX.Element {
      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.project_stopped"
            defaultMessage={`stopped this project`}
          />
        </span>
      );
    }

    function render_project_moved(): React.JSX.Element {
      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.project_moved"
            defaultMessage={`moved this project`}
          />
        </span>
      );
    }

    function render_miniterm_command(cmd: string): React.JSX.Element {
      if (cmd.length > 50) {
        return (
          <Tip
            title="Full command"
            tip={cmd}
            delayHide={10000}
            rootClose={true}
          >
            <kbd>{misc.trunc_middle(cmd, TRUNC)}</kbd>
          </Tip>
        );
      } else {
        return <kbd>{cmd}</kbd>;
      }
    }

    function render_miniterm(event: MiniTermEvent): React.JSX.Element {
      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.miniterm"
            defaultMessage={`executed mini terminal command {cmd}`}
            values={{ cmd: render_miniterm_command(event.input) }}
          />
        </span>
      );
    }

    function project_title(event: { project: string }): React.JSX.Element {
      return (
        <ProjectTitle
          style={cursor ? selected_item : undefined}
          project_id={event.project}
        />
      );
    }

    function file_link(
      path: string,
      link: boolean,
      i: number,
      project_id?: string,
    ): React.JSX.Element {
      return (
        <PathLink
          path={path}
          full={true}
          style={cursor ? selected_item : undefined}
          key={i}
          trunc={TRUNC}
          link={link}
          project_id={project_id != null ? project_id : props.project_id}
          onOpen={() =>
            track("open-file", {
              how: "project-log",
              type: "file_link",
              path,
              project_id,
            })
          }
        />
      );
    }

    function multi_file_links(
      event: { files: string | string[] },
      link?: boolean,
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

    function render_file_action(e: FileActionEvent): React.JSX.Element {
      const computeServer = e.compute_server_id ? (
        <ComputeServerTag
          id={e.compute_server_id}
          style={{ float: "right", maxWidth: "125px" }}
        />
      ) : undefined;
      switch (e.action) {
        case "deleted":
          return (
            <span>
              {intl.formatMessage(labels.deleted)} {multi_file_links(e, true)}{" "}
              {e.count != null ? `(${e.count} total)` : ""}
              {computeServer}
            </span>
          );
        case "downloaded":
          return (
            <span>
              {intl.formatMessage(labels.downloaded)}{" "}
              {multi_file_links(e, true)}{" "}
              {e.count != null ? `(${e.count} total)` : ""}
              {computeServer}
            </span>
          );
        case "moved":
          return (
            <span>
              {intl.formatMessage(labels.moved)} {multi_file_links(e, false)}{" "}
              {e.count != null ? `(${e.count} total)` : ""} to {to_link(e)}
              {computeServer}
            </span>
          );
        case "renamed":
          return (
            <span>
              {intl.formatMessage(labels.renamed)} {file_link(e.src, false, 0)}{" "}
              to {file_link(e.dest, true, 1)}
              {computeServer}
            </span>
          );
        case "copied":
          return (
            <span>
              {intl.formatMessage(labels.copied)} {multi_file_links(e)}{" "}
              {e.count != null ? `(${e.count} total)` : ""} to {to_link(e)}
              {computeServer}
              {e.src_compute_server_id != null &&
                e.src_compute_server_id != e.dest_compute_server_id && (
                  <span style={{ float: "right" }}>
                    <ComputeServerTag
                      id={e.src_compute_server_id}
                      style={{ maxWidth: "125px" }}
                    />
                    <Icon
                      name="arrow-right"
                      style={{
                        top: "-5px",
                        position: "relative",
                        marginRight: "5px",
                      }}
                    />
                    <ComputeServerTag
                      id={e.dest_compute_server_id ?? 0}
                      style={{ maxWidth: "125px" }}
                    />
                  </span>
                )}
            </span>
          );
        case "shared":
          return (
            <span>
              {intl.formatMessage(labels.shared)} {multi_file_links(e)}{" "}
              {e.count != null ? `(${e.count} total)` : ""}
              {computeServer}
            </span>
          );
        case "uploaded":
          return (
            <span>
              {intl.formatMessage(labels.uploaded)} {file_link(e.file, true, 0)}{" "}
              {computeServer}
            </span>
          );
        case "created":
          return (
            <span>
              {intl.formatMessage(labels.created)} {multi_file_links(e)}{" "}
              {computeServer}
            </span>
          );
      }
    }

    function click_set(e: React.SyntheticEvent): void {
      e.preventDefault();
      redux.getActions({ project_id }).set_active_tab("settings");
    }

    function render_set(obj: any): Rendered[] {
      let i = 0;
      const result: React.JSX.Element[] = [];
      for (const key in obj) {
        i += 1;
        const value = obj[key];
        if (key == "image") {
          result.push(
            <span key={i}>
              set project image to{" "}
              <img src={value} width="16px" height="16px" />
            </span>,
          );
          continue;
        }
        let content = `${key} to ${value}`;
        if (i < obj.length) {
          content += "<Space/>and";
        }
        result.push(
          <span key={i}>
            set{" "}
            <a
              onClick={click_set}
              style={cursor ? selected_item : undefined}
              href=""
            >
              {content}
            </a>
          </span>,
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

    function render_llm(event: LLMEvent): Rendered {
      const { usage, model, path } = event;

      const name = (
        <Space size="small">
          <AIAvatar size={14} style={{ top: "1px" }} />
          {model ? `LLM (${modelToName(model)})` : "LLM"}
        </Space>
      );

      const pathLink = (
        <PathLink
          path={path}
          full={true}
          style={cursor ? selected_item : undefined}
          trunc={TRUNC}
          project_id={project_id}
        />
      );

      switch (usage) {
        case "jupyter-cell-button":
          const mode = event.mode;
          return (
            <span>
              queried an {name} to {mode || "modify"} a cell in {pathLink}
            </span>
          );

        case "jupyter-generate-cell":
          return (
            <span>
              used an {name} to generate cells in {pathLink}
            </span>
          );

        case "jupyter-generate-notebook":
          return (
            <span>
              used an {name} to generate the Jupyter Notebook {pathLink}
            </span>
          );

        case "generate-document":
          return (
            <span>
              used an {name} to generate the Document {pathLink}
            </span>
          );

        default:
          misc.unreachable(usage);
          // This is only for forward compatibility reasons.
          return (
            <span>
              used an {name} in {pathLink}
            </span>
          );
      }
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
                style={cursor ? selected_item : undefined}
                trunc={TRUNC}
                project_id={project_id}
              />
            </span>
          );
      }
    }

    function render_upgrade(event: UpgradeEvent): Rendered {
      const { params } = require("@cocalc/util/schema").PROJECT_UPGRADES;
      const v: React.JSX.Element[] = [];
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
          (params[param] != null ? params[param].display_unit : undefined) !=
          null
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
          </span>,
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

    function render_pay_as_you_go(event: PayAsYouGoUpgradeEvent) {
      return (
        <span>
          ran this project with temporary Pay As You Go Upgrade:{" "}
          {event.quota && <DisplayProjectQuota quota={event.quota} />}
        </span>
      );
    }

    function render_invite_user(event: CollaboratorEvent): React.JSX.Element {
      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.invited_user"
            defaultMessage={"invited user"}
          />{" "}
          <User user_map={user_map} account_id={event.invitee_account_id} />
        </span>
      );
    }

    function render_invite_nonuser(
      event: CollaboratorEvent,
    ): React.JSX.Element {
      return (
        <span>
          <FormattedMessage
            id="project.history.log-entry.invited_user_via"
            defaultMessage={"invited new user via"}
          />{" "}
          {event.invitee_email}
        </span>
      );
    }

    function render_remove_collaborator(
      event: CollaboratorEvent,
    ): React.JSX.Element {
      return (
        <span>
          {" "}
          <FormattedMessage
            id="project.history.log-entry.removed_user"
            defaultMessage={"removed user"}
          />{" "}
          {event.removed_name}
        </span>
      );
    }

    function render_desc(): Rendered | Rendered[] {
      if (typeof event === "string") {
        return <span>{event}</span>;
      }

      // ignores events like {time: 1234} – see https://github.com/sagemathinc/cocalc/issues/5927
      if (isUnknownEvent(event)) {
        return;
      }

      switch (event.event) {
        case "compute-server":
          return <ComputeLogEntry event={event} project_id={project_id} />;
        case "start_project":
          return render_start_project(event);
        case "project_stop_requested":
          return render_project_stop_requested();
        case "project_stopped":
          return render_project_stopped();
        case "project_moved":
          return render_project_moved();
        case "project_start_requested":
          return render_project_start_requested();
        case "project_started":
          return render_project_started();
        case "project_restart_requested":
          return render_project_restart_requested();
        case "open": // open a file
          return render_open_file(event);
        case "set":
          return render_set(misc.copy_without(event, "event"));
        case "miniterm":
          return render_miniterm(event);
        case "termInSearch":
          return render_miniterm(event);
        case "file_action":
          return render_file_action(event);
        case "upgrade":
          return render_upgrade(event);
        case "license":
          return render_license(event);
        case "pay-as-you-go-upgrade":
          return render_pay_as_you_go(event);
        case "invite_user":
          return render_invite_user(event);
        case "invite_nonuser":
          return render_invite_nonuser(event);
        case "remove_collaborator":
          return render_remove_collaborator(event);
        case "open_project": // not used anymore???
          return <span>opened this project</span>;
        case "library":
          return render_library(event);
        case "assistant":
          return render_assistant(event);
        case "x11":
          return render_x11(event);
        case "delete_project":
          return <span>deleted the project</span>;
        case "undelete_project":
          return <span>undeleted the project</span>;
        case "hide_project":
          return <span>hid the project from themself</span>;
        case "unhide_project":
          return <span>unhid the project from themself</span>;
        case "public_path":
          return render_public_path(event);
        case "software_environment":
          return render_software_environment(event);
        case "llm":
          return render_llm(event);
        default:
          return <span>Unknown event: {JSON.stringify(event)}</span>;
      }
    }
    // ignore unknown -- would just look mangled to user...
    //else
    // FUTURE:
    //    return <span>{misc.to_json(@event)}</span>

    function render_user(): React.JSX.Element {
      if (account_id != null) {
        return <User user_map={user_map} account_id={account_id} />;
      } else {
        return <SystemProcess event={event as SystemEvent} />;
      }
    }

    function render_avatar(): React.JSX.Element {
      if (account_id != null) {
        return <Avatar account_id={account_id} size={24} />;
      } else {
        return <Icon name="robot" />;
      }
    }

    function icon(): IconName {
      if (typeof event === "string" || event == null || isUnknownEvent(event)) {
        return "dot-circle";
      }

      switch (event.event) {
        case "compute-server":
          return "server";
        case "open_project":
          return "folder-open";
        case "open": // open a file
          const ext = misc.filename_extension(event.filename);
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
          const action_name = file_action_icons[event.action];
          return FILE_ACTIONS[action_name].icon;
        case "upgrade":
          return "arrow-circle-up";
        case "invite_user":
        case "invite_nonuser":
        case "remove_collaborator":
          return "user";
        case "software_environment":
          return SOFTWARE_ENVIRONMENT_ICON;
        case "public_path":
          return "share-square";
      }

      if (event.event.indexOf("project") !== -1) {
        return "edit";
      } else {
        return "dot-circle";
      }
    }

    function renderDuration() {
      if (typeof event != "string" && event["duration_ms"] != null) {
        return (
          <> (time = {round1((event["duration_ms"] ?? 0) / 1000)} seconds) </>
        );
      }
    }

    function renderExtra() {
      // flyout mode only: if colum is wider, add timestamp
      if (mode === "flyout" && flyoutExtra) {
        return (
          <span style={{ color: COLORS.GRAY_M }}>
            <Gap /> <TimeAgo date={props.time} />
          </span>
        );
      }
    }

    switch (mode) {
      case "full":
        const style = props.cursor ? selected_item : backgroundStyle;
        return (
          <Grid style={{ width: "100%" }}>
            <Row style={style}>
              <Col sm={1} style={{ textAlign: "center" }}>
                <Icon name={icon()} style={style} />
              </Col>
              <Col sm={11}>
                {render_user()}
                <Gap />
                {render_desc()}
                {renderDuration()}
                <Gap />
                <TimeAgo style={style} date={props.time} />
              </Col>
            </Row>
          </Grid>
        );
      case "flyout":
        return (
          <div
            className={"cc-project-log-history-entry"}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              ...backgroundStyle,
            }}
          >
            <Tooltip
              placement="rightTop"
              title={
                <>
                  <TimeAgo date={props.time} />
                </>
              }
            >
              <div style={{ flex: "1", padding: "5px" }}>
                {render_avatar()} <Icon name={icon()} /> {render_desc()}{" "}
                {renderDuration()} {renderExtra()}
              </div>
            </Tooltip>
          </div>
        );
      default:
        misc.unreachable(mode);
        return <></>;
    }
  },
  areEqual,
);
