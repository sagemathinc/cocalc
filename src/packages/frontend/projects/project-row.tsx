/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Render a single project entry, which goes in the list of projects
*/

import { CSSProperties, useEffect } from "react";
import { Col, Row, Well } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  React,
  redux,
  useActions,
  useIsMountedRef,
  useRedux,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { AddCollaborators } from "@cocalc/frontend/collaborators";
import {
  Gap,
  Icon,
  Markdown,
  Paragraph,
  ProjectState,
  TimeAgo,
} from "@cocalc/frontend/components";
import {
  compute_image2basename,
  is_custom_image,
} from "@cocalc/frontend/custom-software/util";
import track from "@cocalc/frontend/user-tracking";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { COLORS } from "@cocalc/util/theme";
import { Avatar, Button, Tooltip } from "antd";
import { CSSProperties, useEffect } from "react";
import { ProjectUsers } from "./project-users";
import { useBookmarkedProjects } from "./use-bookmarked-projects";
import { blendBackgroundColor } from "./util";

const image_name_style: React.CSSProperties = {
  fontSize: "12px",
  color: COLORS.GRAY,
  marginTop: "5px",
} as const;

interface Props {
  project_id: string;
  index?: number;
}

export const ProjectRow: React.FC<Props> = ({ project_id, index }: Props) => {
  const [selection_at_last_mouse_down, set_selection_at_last_mouse_down] =
    useState<string>("");
  const project = useRedux(["projects", "project_map", project_id]);

  const [add_collab, set_add_collab] = useState<boolean>(false);
  const images = useTypedRedux("compute_images", "images");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const kucalc = useTypedRedux("customize", "kucalc");
  const software = useTypedRedux("customize", "software");

  const actions = useActions("projects");
  const { isProjectBookmarked, setProjectBookmarked } = useBookmarkedProjects();

  function render_star(): React.JSX.Element {
    const isStarred = isProjectBookmarked(project_id);
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          minHeight: "21px",
          cursor: "pointer",
        }}
        onClick={(e) => {
          e.stopPropagation();
          setProjectBookmarked(project_id, !isStarred);
        }}
      >
        <Icon
          name={isStarred ? "star-filled" : "star"}
          style={{
            color: isStarred ? COLORS.STAR : COLORS.GRAY,
            fontSize: "16px",
          }}
        />
      </div>
    );
  }

  function render_add_collab(): React.JSX.Element | undefined {
    if (!add_collab) {
      return;
    }
    return (
      <AddCollaborators
        project_id={project_id}
        autoFocus
        where="projects-list"
      />
    );
  }

  function render_collab(): React.JSX.Element {
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
              <Icon name={add_collab ? "caret-down" : "caret-right"} />
            </span>
            <Gap />
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
  function render_image_name(): React.JSX.Element | undefined {
    const ci = project.get("compute_image");
    if (ci == null || images == null) return;
    if (is_custom_image(ci)) {
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
      if (ci === DEFAULT_COMPUTE_IMAGE) return; // avoid clutter for the default.
      // sanitizeSoftwareEnv ensures the title is set, but maybe there is no image named $ci
      const name = software?.getIn(["environments", ci, "title"]) ?? ci;
      const descr = software?.getIn(["environments", ci, "descr"]) ?? "";
      return (
        <div style={image_name_style}>
          <span title={descr}>{name}</span>
          {kucalc === KUCALC_COCALC_COM && (
            <>
              {" "}
              {<span title="Official image created by CoCalc">(official)</span>}
            </>
          )}
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
    track("open_project", { how: "projects_page", project_id });
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

  const color = project.get("color");
  const borderStyle = color ? `4px solid ${color}` : undefined;

  // Calculate background color with faint hint of project color
  const isEvenRow = (index ?? 0) % 2 === 1;
  const baseColor = isEvenRow ? COLORS.GRAY_LL : "white"; // even color same as background in projects-nav.ts ProjectsNav::renderTabBar0
  const backgroundColor = blendBackgroundColor(color, baseColor, isEvenRow);

  const project_row_styles: CSS = {
    backgroundColor,
    marginBottom: 0,
    cursor: "pointer",
    wordWrap: "break-word",
    ...(borderStyle
      ? {
          borderLeft: borderStyle,
          borderRight: borderStyle,
        }
      : undefined),
  };

  if (project == null) {
    return <></>;
  }

  return (
    <Well style={project_row_styles} onMouseDown={handle_mouse_down}>
      <Row>
        <Col
          sm={1}
          style={{
            maxWidth: "50px",
            padding: "0 5px",
            alignSelf: "flex-start",
          }}
        >
          {!is_anonymous && render_star()}
        </Col>
        <Col
          onClick={handle_click}
          sm={3}
          style={{
            maxHeight: "10em",
            overflowY: "auto",
          }}
        >
          <div style={{ fontWeight: "bold", display: "flex" }}>
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
          sm={2}
          style={{
            color: COLORS.GRAY,
            maxHeight: "10em",
            overflowY: "auto",
          }}
        >
          {render_project_description()}
        </Col>
        <Col sm={3}>{!is_anonymous && render_collab()}</Col>
        <Col sm={1} onClick={open_project_settings}>
          {!is_anonymous && (
            <a>
              <ProjectState state={project.get("state")} />
            </a>
          )}
        </Col>
        <Col sm={2}>
          {project.get("avatar_image_tiny") && (
            <ProjectAvatarImage
              project_id={project_id}
              size={120}
              onClick={handle_click}
              style={{ margin: "-20px 0", textAlign: "center" }}
            />
          )}
        </Col>
        <Col sm={1}>
          {!is_anonymous && (
            <Tooltip
              title={`Cloning ${project.get("title")} makes an exact complete copy of the project, including any customization to the root filesystem / (e.g., systemwide software install).  It has the same root filesystem image.`}
            >
              <Button>
                <Icon name="fork-outlined" /> Clone
              </Button>
            </Tooltip>
          )}
        </Col>
      </Row>
    </Well>
  );
};

interface ProjectAvatarImageProps {
  project_id: string;
  size?: number;
  onClick?: Function;
  style?: CSSProperties;
  askToAddAvatar?: boolean;
}

export function ProjectAvatarImage(props: ProjectAvatarImageProps) {
  const { project_id, size, onClick, style, askToAddAvatar = false } = props;
  const isMounted = useIsMountedRef();
  const [avatarImage, setAvatarImage] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const img = await redux
        .getStore("projects")
        .getProjectAvatarImage(project_id);
      if (!isMounted.current) return;
      setAvatarImage(img);
    })();
  }, []);

  function renderAdd(): React.JSX.Element {
    if (!askToAddAvatar || onClick == null) return <></>;
    return (
      <Paragraph type="secondary" style={style} onClick={(e) => onClick(e)}>
        (Click to add avatar image)
      </Paragraph>
    );
  }

  return avatarImage ? (
    <div style={style} onClick={(e) => onClick?.(e)}>
      <Avatar
        shape="square"
        size={size ?? 160}
        icon={<img src={avatarImage} />}
      />
    </div>
  ) : (
    renderAdd()
  );
}
