/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render a single project entry, which goes in the list of projects
*/

import {
  React,
  useState,
  useActions,
  useStore,
  useRedux,
  useTypedRedux,
} from "../app-framework";
import { ProjectUsers } from "./project-users";
import { AddCollaborators } from "../collaborators/add-collaborators";
import { Row, Col, Well } from "../antd-bootstrap";
import { Icon, Markdown, ProjectState, Space, TimeAgo } from "../r_misc";
import { id2name } from "../custom-software/init";
import {
  CUSTOM_IMG_PREFIX,
  compute_image2basename,
} from "../custom-software/util";
import { COLORS } from "smc-util/theme";
import { user_tracking } from "../user-tracking";

const image_name_style: React.CSSProperties = {
  fontSize: "12px",
  color: COLORS.GRAY,
  marginTop: "5px",
};

interface Props {
  project_id: string;
  index?: number;
}

export const ProjectRow: React.FC<Props> = ({ project_id, index }: Props) => {
  const [
    selection_at_last_mouse_down,
    set_selection_at_last_mouse_down,
  ] = useState<string>("");
  const project = useRedux(["projects", "project_map", project_id]);

  const [add_collab, set_add_collab] = useState<boolean>(false);
  const images = useTypedRedux("compute_images", "images");
  const is_anonymous = useTypedRedux("account", "is_anonymous");

  const store = useStore("projects");
  const actions = useActions("projects");

  function render_add_collab(): JSX.Element | undefined {
    if (!add_collab) {
      return;
    }
    const allow_urls = store.allow_urls_in_emails(project_id);
    return (
      <div>
        <h5>Add collaborators to project</h5>
        <AddCollaborators
          project={project}
          inline={true}
          trust={allow_urls}
        />
      </div>
    );
  }

  function render_collab(): JSX.Element {
    return (
      <div>
        <div
          style={{ maxHeight: "7em", overflowY: "auto" }}
          onClick={(e) => {
            set_add_collab(!add_collab);
            e.stopPropagation();
          }}
        >
          <a>
            {" "}
            <span style={{ fontSize: "15pt" }}>
              <Icon name={`caret-${add_collab ? "down" : "right"}`} />
            </span>
            <Space />
            <Icon
              name="user"
              style={{ fontSize: "16pt", marginRight: "10px" }}
            />
            <ProjectUsers project={project} />
          </a>
        </div>
        {render_add_collab()}
      </div>
    );
  }

  // transforms the compute image ID to a human readable string
  function render_image_name(): JSX.Element | undefined {
    const ci = project.get("compute_image");
    if (ci == null || images == null) return;
    if (ci.startsWith(CUSTOM_IMG_PREFIX)) {
      const id = compute_image2basename(ci);
      const img = images.get(id);
      if (img == null) return;
      const name = img.get("display");
      return (
        <div style={image_name_style}>
          {name}{" "}
          <span title="Custom image created by a third party">(custom)</span>
        </div>
      );
    } else {
      // official
      const name = id2name(ci);
      if (name === "Default") return; // avoid clutter for the default.
      return (
        <div style={image_name_style}>
          {name}{" "}
          <span title="Official image created by CoCalc">(official)</span>
        </div>
      );
    }
  }

  function render_project_description() {
    const desc = project.get("description");
    if (desc == "No Description") {
      // Don't bother showing the "No Description" default; it's clutter
      return;
    }
    return <Markdown style={{ color: COLORS.GRAY }} value={desc} />;
  }

  function handle_mouse_down(): void {
    set_selection_at_last_mouse_down((window.getSelection() ?? "").toString());
  }

  function handle_click(e?, force?: boolean): void {
    if (!force && add_collab) return;
    const cur_sel = (window.getSelection() ?? "").toString();
    // Check if user has highlighted some text.  Do NOT open if the user seems
    // to be trying to highlight text on the row, e.g., for copy pasting.
    if (cur_sel === selection_at_last_mouse_down) {
      open_project_from_list(e);
    }
  }

  function open_project_from_list(e?): void {
    actions.open_project({
      project_id,
      switch_to: !(e?.which === 2 || e?.ctrlKey || e?.metaKey),
    });
    e?.preventDefault();
    user_tracking("open_project", { how: "projects_page", project_id });
  }

  function open_project_settings(e): void {
    if (add_collab) return;
    if (is_anonymous) return;
    actions.open_project({
      project_id,
      switch_to: !(e.which === 2 || e.ctrlKey || e.metaKey),
      target: "settings",
    });
    e.stopPropagation();
  }

  const project_row_styles: React.CSSProperties = {
    backgroundColor: (index ?? 0) % 2 ? "#eee" : "white",
    marginBottom: 0,
    cursor: "pointer",
    wordWrap: "break-word",
  };

  if (project == null) {
    return <></>;
  }

  return (
    <Well style={project_row_styles} onMouseDown={handle_mouse_down}>
      <Row>
        <Col
          onClick={handle_click}
          sm={3}
          style={{
            maxHeight: "10em",
            overflowY: "auto",
          }}
        >
          <div style={{ fontWeight: "bold" }}>
            <a
              cocalc-test="project-line"
              onClick={() => handle_click(undefined, true)}
            >
              <Markdown value={project.get("title")} />
            </a>
          </div>
          <TimeAgo date={project.get("last_edited")} />
          {render_image_name()}
        </Col>
        <Col
          onClick={handle_click}
          sm={3}
          style={{
            color: COLORS.GRAY,
            maxHeight: "10em",
            overflowY: "auto",
          }}
        >
          {render_project_description()}
        </Col>
        <Col sm={4}>{!is_anonymous && render_collab()}</Col>
        <Col sm={2} onClick={open_project_settings}>
          {!is_anonymous && (
            <a>
              <ProjectState state={project.get("state")} />
            </a>
          )}
        </Col>
      </Row>
    </Well>
  );
};
