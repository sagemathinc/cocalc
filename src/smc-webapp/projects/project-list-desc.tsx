/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon, Space } from "../r_misc";
import { plural } from "smc-util/misc";
import { Alert, Button, ButtonGroup, ButtonToolbar } from "../antd-bootstrap";
import { webapp_client } from "../webapp-client";
import { alert_message } from "../alerts";
import {
  React,
  useActions,
  useMemo,
  useRedux,
  useState,
} from "../app-framework";
import { ResetProjectsConfirmation } from "../account/upgrades/reset-projects";

interface Props {
  visible_projects: string[];
  onCancel: () => void;
}

export const ProjectsListingDescription: React.FC<Props> = ({
  visible_projects,
  onCancel,
}) => {
  const deleted = useRedux(["projects", "deleted"]);
  const hidden = useRedux(["projects", "hidden"]);
  const search: string | undefined = useRedux(["projects", "search"]);
  const selected_hashtags = useRedux(["projects", "selected_hashtags"]);
  const selected_hashtags_for_filter: {
    [tag: string]: boolean;
  } = useMemo(() => {
    const filter = `${!!hidden}-${!!deleted}`;
    return selected_hashtags?.get(filter)?.toJS() ?? {};
  }, [selected_hashtags, deleted, hidden]);

  const [show_alert, set_show_alert] = useState<
    "none" | "hide" | "remove" | "remove-upgrades" | "delete"
  >("none");

  const project_map = useRedux(["projects", "project_map"]);
  const account_id = useRedux(["account", "account_id"]);

  const actions = useActions("projects");

  function render_header(): JSX.Element | undefined {
    if (project_map.size > 0 && (hidden || deleted)) {
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

  function render_span(query: string): JSX.Element {
    return (
      <span>
        whose title, description or users contain <strong>{query}</strong>
        <Space />
        <Space />
        <Button
          onClick={() => {
            set_show_alert("none");
            onCancel();
          }}
        >
          Cancel
        </Button>
      </span>
    );
  }

  function render_projects_actions_toolbar(): JSX.Element {
    return (
      <div>
        <ButtonGroup>
          {visible_projects.length > 0
            ? render_remove_from_all_button()
            : undefined}
          {visible_projects.length > 0 && !deleted
            ? render_delete_all_button()
            : undefined}
          {visible_projects.length > 0 && !hidden
            ? render_hide_all_button()
            : undefined}
          {visible_projects.length > 0
            ? render_remove_upgrades_from_all_button()
            : undefined}
        </ButtonGroup>
      </div>
    );
  }

  function render_projects_actions_alert(): JSX.Element | undefined {
    switch (show_alert) {
      case "hide":
        return render_hide_all();
      case "remove":
        return render_remove_from_all();
      case "remove-upgrades":
        return render_remove_upgrades_from_all();
      case "delete":
        return render_delete_all();
    }
  }

  function render_alert_message(): JSX.Element | undefined {
    let query = (search ?? "").toLowerCase();
    const hashtags_string = (() => {
      const result: string[] = [];
      for (const name in selected_hashtags_for_filter) {
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
          Only showing
          <Space />
          <strong>{`${deleted ? "deleted " : ""}${
            hidden ? "hidden " : ""
          }`}</strong>
          projects
          <Space />
          {query !== "" ? render_span(query) : undefined}
          {render_projects_actions_toolbar()}
          {render_projects_actions_alert()}
        </Alert>
      );
    }
  }

  function render_hide_all_button(): JSX.Element {
    return (
      <Button
        disabled={show_alert === "hide"}
        onClick={() => set_show_alert("hide")}
      >
        <Icon name="eye-slash" /> Hide...
      </Button>
    );
  }

  function render_delete_all_button(): JSX.Element {
    return (
      <Button
        disabled={show_alert === "delete"}
        onClick={() => set_show_alert("delete")}
      >
        <Icon name="trash" /> Delete...
      </Button>
    );
  }

  function render_remove_from_all_button(): JSX.Element {
    return (
      <Button
        disabled={show_alert === "remove"}
        onClick={() => set_show_alert("remove")}
      >
        <Icon name="user-times" /> Remove Myself...
      </Button>
    );
  }

  function render_remove_upgrades_from_all_button(): JSX.Element {
    return (
      <Button
        disabled={show_alert === "remove-upgrades"}
        onClick={() => set_show_alert("remove-upgrades")}
      >
        <Icon name="arrow-circle-down" /> Remove Upgrades...
      </Button>
    );
  }

  function render_hide_all(): JSX.Element | undefined {
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
          <Button bsStyle="warning" onClick={do_hide_all}>
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
        project_map.getIn([project_id, "users", account_id, "group"]) !==
        "owner"
    );
  }

  function render_remove_upgrades_from_all(): JSX.Element | undefined {
    if (visible_projects.length === 0) {
      return;
    }
    return (
      <ResetProjectsConfirmation
        on_confirm={() => {
          set_show_alert("none");
          do_remove_upgrades_from_all();
        }}
        on_cancel={() => set_show_alert("none")}
      />
    );
  }

  async function do_remove_upgrades_from_all(): Promise<void> {
    try {
      await webapp_client.project_client.remove_all_upgrades(visible_projects);
    } catch (err) {
      err = `Error removing upgrades -- ${err.toString()}`;
      alert_message({ type: "error", message: err });
    }
  }

  function render_remove_from_all(): JSX.Element | undefined {
    if (visible_projects.length === 0) {
      return;
    }
    const v = collab_projects();
    const head = (
      <h4>
        <Icon name="user-times" /> Remove Myself from Projects
      </h4>
    );
    if (v.length === 0) {
      return (
        <Alert key="remove_all" style={{ marginTop: "15px" }}>
          {head}
          You are the owner of every displayed project. You can only remove
          yourself from projects that you do not own.{" "}
          <Button onClick={() => set_show_alert("none")}>Cancel</Button>
        </Alert>
      );
    } else {
      let desc;
      if (v.length < visible_projects.length) {
        const other = visible_projects.length - v.length;
        desc = `You are a collaborator on ${v.length} of the ${
          visible_projects.length
        } ${plural(
          visible_projects.length,
          "project"
        )} listed here (you own the other ${plural(other, "one")}).`;
      } else {
        if (v.length === 1) {
          desc = "You are a collaborator on the one project listed here.";
        } else {
          desc = `You are a collaborator on ALL of the ${v.length} ${plural(
            v.length,
            "project"
          )} listed here.`;
        }
      }
      return (
        <Alert style={{ marginTop: "15px" }}>
          {head} {desc}
          <p />
          Are you sure you want to remove yourself from the {v.length}{" "}
          {plural(v.length, "project")} listed below that you collaborate on?
          <br />
          <b>
            You will no longer have access and cannot add yourself back.
          </b>{" "}
          <ButtonToolbar style={{ marginTop: "15px" }}>
            <Button bsStyle="danger" onClick={do_remove_from_all}>
              <Icon name="user-times" /> Remove Myself From {v.length}{" "}
              {plural(v.length, "Project")}
            </Button>
            <Button onClick={() => set_show_alert("none")}>Cancel</Button>
          </ButtonToolbar>
        </Alert>
      );
    }
  }

  function do_remove_from_all(): void {
    for (const project_id of collab_projects()) {
      actions.remove_collaborator(project_id, account_id);
    }
    set_show_alert("none");
  }

  function render_can_be_undone(): JSX.Element {
    return (
      <span>
        <br />
        This can be undone in project settings.
      </span>
    );
  }

  function render_delete_all(): JSX.Element | undefined {
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
          <Button bsStyle="danger" onClick={do_delete_all}>
            <Icon name="trash" /> Yes, please delete {visible_projects.length}{" "}
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
