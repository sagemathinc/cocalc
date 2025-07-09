/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { useIntl } from "react-intl";
import {
  Alert,
  ButtonGroup,
  ButtonToolbar,
} from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  useActions,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Gap, Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { plural } from "@cocalc/util/misc";
import RemoveMyself from "./remove-myself";

interface Props {
  visible_projects: string[];
  onCancel: () => void;
}

export const ProjectsListingDescription: React.FC<Props> = ({
  visible_projects,
  onCancel,
}) => {
  const intl = useIntl();

  const deleted = useTypedRedux("projects", "deleted");
  const hidden = useTypedRedux("projects", "hidden");
  const search: string | undefined = useTypedRedux("projects", "search");
  const selected_hashtags = useTypedRedux("projects", "selected_hashtags");
  const selected_hashtags_for_filter: string[] = useMemo(() => {
    const filter = `${!!hidden}-${!!deleted}`;
    return selected_hashtags?.get(filter)?.toJS() ?? [];
  }, [selected_hashtags, deleted, hidden]);

  const [show_alert, set_show_alert] = useState<
    | "none"
    | "hide"
    | "remove"
    | "remove-upgrades"
    | "delete"
    | "stop"
    | "restart"
  >("none");

  const project_map = useTypedRedux("projects", "project_map");
  const account_id = useTypedRedux("account", "account_id");

  const actions = useActions("projects");

  function render_header(): React.JSX.Element | undefined {
    if ((project_map?.size ?? 0) > 0 && (hidden || deleted)) {
      const d = deleted ? "deleted " : "";
      const h = hidden ? "hidden " : "";
      const a = hidden && deleted ? " and " : "";
      const n = visible_projects.length;
      const desc = `Only showing ${n} ${d}${a}${h} ${plural(n, "project")}`;
      return (
        <h4 style={{ color: "#666", wordWrap: "break-word", marginTop: 0 }}>
          {desc}
        </h4>
      );
    }
  }

  function render_span(query: string): React.JSX.Element {
    return (
      <span>
        whose title, description, state or users match{" "}
        <strong>{query.trim() ? `'${query}'` : "anything"}</strong>
        {query.trim() && <> (use a space to select everything)</>}.
        <Gap />
        <Gap />
        <Button
          onClick={() => {
            set_show_alert("none");
            onCancel();
          }}
        >
          {intl.formatMessage(labels.cancel)}
        </Button>
      </span>
    );
  }

  function render_projects_actions_toolbar(): React.JSX.Element {
    if (visible_projects.length == 0) {
      return null;
    }
    return (
      <ButtonGroup style={{ margin: "15px" }}>
        {!deleted ? render_delete_all_button() : undefined}
        {!hidden ? render_hide_all_button() : undefined}
        {render_stop_all_button()}
        {render_restart_all_button()}
        <RemoveMyself project_ids={visible_projects} />
      </ButtonGroup>
    );
  }

  function render_projects_actions_alert(): React.JSX.Element | undefined {
    switch (show_alert) {
      case "hide":
        return render_hide_all();
      case "delete":
        return render_delete_all();
      case "stop":
        return render_stop_all();
      case "restart":
        return render_restart_all();
    }
  }

  function render_alert_message(): React.JSX.Element | undefined {
    let query = (search ?? "").toLowerCase();
    const hashtags_string = (() => {
      const result: string[] = [];
      for (const name of selected_hashtags_for_filter) {
        result.push(name);
      }
      return result;
    })().join(" ");
    if (query !== "" && hashtags_string !== "") {
      query += " ";
    }
    query += hashtags_string;

    if (query !== "" || deleted || hidden) {
      return (
        <Alert bsStyle="warning" style={{ fontSize: "1.3em" }}>
          Only showing the {visible_projects.length}
          <Gap />
          <strong>{`${deleted ? "deleted " : ""}${
            hidden ? "hidden " : ""
          }`}</strong>
          {plural(visible_projects.length, "project")}
          <Gap />
          {query !== "" ? render_span(query) : undefined}
          {render_projects_actions_toolbar()}
          {render_projects_actions_alert()}
        </Alert>
      );
    }
  }

  function render_hide_all_button(): React.JSX.Element {
    return (
      <Button
        disabled={show_alert === "hide"}
        onClick={() => set_show_alert("hide")}
      >
        <Icon name="eye-slash" /> Hide...
      </Button>
    );
  }

  function render_delete_all_button(): React.JSX.Element {
    return (
      <Button
        disabled={show_alert === "delete"}
        onClick={() => set_show_alert("delete")}
      >
        <Icon name="trash" /> Delete...
      </Button>
    );
  }

  function render_stop_all_button(): React.JSX.Element {
    return (
      <Button
        disabled={show_alert === "stop"}
        onClick={() => set_show_alert("stop")}
      >
        <Icon name="stop" /> Stop...
      </Button>
    );
  }

  function render_restart_all_button(): React.JSX.Element {
    return (
      <Button
        disabled={show_alert === "restart"}
        onClick={() => set_show_alert("restart")}
      >
        <Icon name="sync-alt" /> Restart...
      </Button>
    );
  }

  function renderRemoveMyself() {}

  function render_hide_all(): React.JSX.Element | undefined {
    if (visible_projects.length === 0) {
      return;
    }
    return (
      <Alert key="hide-all" style={{ marginTop: "15px" }}>
        <h4>
          <Icon name="eye-slash" /> Hide Projects
        </h4>
        Are you sure you want to hide the {visible_projects.length}{" "}
        {plural(visible_projects.length, "project")} listed below?
        <br />
        <b>This hides the project from you, not your collaborators.</b>
        {render_can_be_undone()}
        <ButtonToolbar style={{ marginTop: "15px" }}>
          <Button danger onClick={do_hide_all}>
            <Icon name="eye-slash" /> Hide {visible_projects.length}{" "}
            {plural(visible_projects.length, "project")}
          </Button>
          <Button onClick={() => set_show_alert("none")}>Cancel</Button>
        </ButtonToolbar>
      </Alert>
    );
  }

  function do_hide_all(): void {
    for (const project_id of visible_projects) {
      actions.toggle_hide_project(project_id);
    }
    set_show_alert("none");
  }

  function collab_projects(): string[] {
    // Determine visible projects this user does NOT own.
    return visible_projects.filter(
      (project_id) =>
        project_map?.getIn([project_id, "users", account_id, "group"]) !==
        "owner",
    );
  }

  function render_can_be_undone(): React.JSX.Element {
    return (
      <span>
        <br />
        This can be undone in project settings.
      </span>
    );
  }

  function render_stop_all(): React.JSX.Element | undefined {
    if (visible_projects.length === 0) {
      return;
    }
    return (
      <Alert>
        <div>Stop these {visible_projects.length} projects?</div>

        <ButtonToolbar style={{ marginTop: "15px" }}>
          <Button
            danger
            onClick={() => {
              for (const project_id of visible_projects) {
                actions.stop_project(project_id);
              }
              set_show_alert("none");
            }}
          >
            Stop
          </Button>
          <Button onClick={() => set_show_alert("none")}>Cancel</Button>
        </ButtonToolbar>
      </Alert>
    );
  }

  function render_restart_all(): React.JSX.Element | undefined {
    if (visible_projects.length === 0) {
      return;
    }
    return (
      <Alert>
        <div>Restart these {visible_projects.length} projects?</div>

        <ButtonToolbar style={{ marginTop: "15px" }}>
          <Button
            danger
            onClick={() => {
              for (const project_id of visible_projects) {
                actions.restart_project(project_id);
              }
              set_show_alert("none");
            }}
          >
            Restart
          </Button>
          <Button onClick={() => set_show_alert("none")}>Cancel</Button>
        </ButtonToolbar>
      </Alert>
    );
  }

  function render_delete_all(): React.JSX.Element | undefined {
    if (visible_projects.length === 0) {
      return;
    }
    const own = visible_projects.length - collab_projects().length;
    let desc;
    if (own === 0) {
      desc = "You do not own any of the listed projects.";
    } else if (own < visible_projects.length) {
      desc = `You are the owner of ${own} of the ${visible_projects.length} listed projects.`;
    } else {
      desc = "You are the owner of every listed project.";
    }
    return (
      <Alert key="delete_all" style={{ marginTop: "15px" }}>
        <h4>
          <Icon name="trash" /> Delete Projects
        </h4>
        {desc}
        <p />
        Are you sure you want to delete the {visible_projects.length}{" "}
        {plural(visible_projects.length, "project")} listed below?
        <br />
        <b>
          This will delete the {plural(visible_projects.length, "project")} for
          all collaborators.
        </b>{" "}
        {render_can_be_undone()}{" "}
        <ButtonToolbar style={{ marginTop: "15px" }}>
          <Button danger onClick={do_delete_all}>
            <Icon name="trash" /> Yes, delete {visible_projects.length}{" "}
            {plural(visible_projects.length, "project")}
          </Button>
          <Button onClick={() => set_show_alert("none")}>Cancel</Button>
        </ButtonToolbar>
      </Alert>
    );
  }

  function do_delete_all(): void {
    for (const project_id of visible_projects) {
      actions.toggle_delete_project(project_id);
    }
    set_show_alert("none");
  }

  return (
    <div>
      {render_header()}
      {render_alert_message()}
    </div>
  );
};
