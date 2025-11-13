/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Popover, Col, Row } from "antd";
import memoizeOne from "memoize-one";
import { CSS, React, useState } from "@cocalc/frontend/app-framework";
import {
  Icon,
  IconName,
  TimeAgo,
  Tip,
  VisibleXS,
} from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { should_open_in_foreground } from "@cocalc/frontend/lib/should-open-in-foreground";
import { open_new_tab } from "@cocalc/frontend/misc";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import track from "@cocalc/frontend/user-tracking";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { url_href } from "@cocalc/frontend/project/utils";
import { FileCheckbox } from "./file-checkbox";
import { PublicButton } from "./public-button";
import { generate_click_for } from "./utils";

export const VIEWABLE_FILE_EXT: Readonly<string[]> = [
  "md",
  "txt",
  "html",
  "pdf",
  "png",
  "jpeg",
] as const;

interface Props {
  isdir: boolean;
  name: string;
  display_name: string; // if given, will display this, and will show true filename in popover
  size: number; // sometimes is NOT known!
  time: number;
  issymlink: boolean;
  checked: boolean;
  selected: boolean;
  color: string;
  mask: boolean;
  public_data: object;
  is_public: boolean;
  current_path: string;
  actions: ProjectActions;
  no_select: boolean;
  link_target?: string;
  // if given, include a little 'server' tag in this color, and tooltip etc using id.
  // Also important for download and preview links!
  computeServerId?: number;
  isStarred?: boolean;
  onToggleStar?: (path: string, starred: boolean) => void;
}

export const FileRow: React.FC<Props> = React.memo((props) => {
  const student_project_functionality = useStudentProjectFunctionality(
    props.actions.project_id,
  );
  const [selection_at_last_mouse_down, set_selection_at_last_mouse_down] =
    useState<string | undefined>(undefined);

  function render_icon() {
    const style: React.CSSProperties = {
      color: props.mask ? "#bbbbbb" : COLORS.FILE_ICON,
      verticalAlign: "sub",
    } as const;
    let body: React.JSX.Element;
    if (props.isdir) {
      body = (
        <>
          <Icon
            name="folder-open"
            style={{ fontSize: "14pt", verticalAlign: "sub" }}
          />
          <Icon
            name="caret-right"
            style={{
              marginLeft: "3px",
              fontSize: "14pt",
              verticalAlign: "sub",
            }}
          />
        </>
      );
    } else {
      // get the file_associations[ext] just like it is defined in the editor
      let name: IconName;
      const info = file_options(props.name);
      if (info != null) {
        name = info.icon;
      } else {
        name = "file";
      }

      body = <Icon name={name} style={{ fontSize: "14pt" }} />;
    }

    return <a style={style}>{body}</a>;
  }

  function render_link_target() {
    if (props.link_target == null || props.link_target == props.name) return;
    return (
      <>
        {" "}
        <Icon name="arrow-right" style={{ margin: "0 10px" }} />{" "}
        {props.link_target}{" "}
      </>
    );
  }

  function render_name_link(styles, name, ext) {
    return (
      <a style={styles} cocalc-test="file-line">
        {misc.trunc_middle(name, 50)}
        <span style={{ color: !props.mask ? COLORS.FILE_EXT : undefined }}>
          {ext === "" ? "" : `.${ext}`}
        </span>
        {render_link_target()}
      </a>
    );
  }

  function render_name() {
    let name = props.display_name ?? props.name;
    let ext: string;
    if (props.isdir) {
      ext = "";
    } else {
      const name_and_ext = misc.separate_file_extension(name);
      ({ name, ext } = name_and_ext);
    }

    const show_tip =
      (props.display_name != undefined && props.name !== props.display_name) ||
      name.length > 50;

    const styles = {
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
      overflowWrap: "break-word",
      verticalAlign: "middle",
      color: props.mask ? "#bbbbbb" : COLORS.TAB,
    };

    if (show_tip) {
      return (
        <Tip
          title={
            props.display_name
              ? "Displayed filename is an alias. The actual name is:"
              : "Full name"
          }
          tip={props.name}
        >
          {render_name_link(styles, name, ext)}
        </Tip>
      );
    } else {
      return render_name_link(styles, name, ext);
    }
  }

  const generate_on_share_click = memoizeOne((full_path: string) => {
    return generate_click_for("share", full_path, props.actions);
  });

  function render_public_file_info() {
    if (props.is_public) {
      return <PublicButton on_click={generate_on_share_click(full_path())} />;
    }
  }

  function render_star() {
    if (!props.onToggleStar) return null;
    const path = full_path();
    const starred = props.isStarred ?? false;
    const iconName = starred ? "star-filled" : "star";

    return (
      <Icon
        name={iconName}
        onClick={(e) => {
          e?.preventDefault();
          e?.stopPropagation();
          props.onToggleStar?.(path, !starred);
        }}
        style={{
          cursor: "pointer",
          fontSize: "14pt",
          color: starred ? COLORS.STAR : COLORS.GRAY_L,
        }}
      />
    );
  }

  function full_path() {
    return misc.path_to_file(props.current_path, props.name);
  }

  function handle_mouse_down() {
    set_selection_at_last_mouse_down(window.getSelection()?.toString() ?? "");
  }

  function handle_click(e) {
    if (
      window.getSelection()?.toString() ??
      "" !== selection_at_last_mouse_down
    ) {
      // This is a trick so that you can select a filename without
      // the click to do the selection triggering opening of the file.
      return;
    }
    if (props.isdir) {
      props.actions.open_directory(full_path());
      props.actions.set_file_search("");
    } else {
      const foreground = should_open_in_foreground(e);
      const path = full_path();
      track("open-file", {
        project_id: props.actions.project_id,
        path,
        how: "click-on-listing",
      });
      props.actions.open_file({
        path,
        foreground,
        explicit: true,
      });
      if (foreground) {
        props.actions.set_file_search("");
      }
    }
  }

  function handle_download_click(e) {
    e.preventDefault();
    e.stopPropagation();
    props.actions.download_file({
      path: full_path(),
      log: true,
    });
  }

  function handle_view_click(e) {
    e.preventDefault();
    e.stopPropagation();
    open_new_tab(url);
  }

  function render_timestamp() {
    try {
      return (
        <TimeAgo
          date={new Date(props.time * 1000).toISOString()}
          style={{ color: COLORS.GRAY_M }}
        />
      );
    } catch (error) {
      return (
        <div style={{ color: COLORS.GRAY_M, display: "inline" }}>
          Invalid Date Time
        </div>
      );
    }
  }

  function render_view_button(url_href, name) {
    // if the file extension of name in lower case is in VIEWABLE_FILE_EXT
    // then we will render a view button
    const ext = misc.filename_extension(name);
    if (ext == null) return null;
    const ext_lower = ext.toLowerCase();
    const style: CSS = {
      marginLeft: "10px",
      color: COLORS.GRAY,
      padding: 0,
    };
    const icon = <Icon name="eye" />;
    if (VIEWABLE_FILE_EXT.includes(ext_lower)) {
      return (
        <Popover
          title={<>{icon} New Tab</>}
          placement="bottomRight"
          content={<>View this file in a new tab.</>}
        >
          <Button
            size="small"
            type="link"
            href={`${url_href}`}
            onClick={handle_view_click}
            style={style}
          >
            {icon}
          </Button>
        </Popover>
      );
    } else {
      //render an invisible placeholder of same size
      return (
        <Button
          type="link"
          size="small"
          style={{ ...style, visibility: "hidden" }}
        >
          {icon}
        </Button>
      );
    }
  }

  function render_download_button(url) {
    if (student_project_functionality.disableActions) return;
    const size = misc.human_readable_size(props.size);
    // TODO: This really should not be in the size column...
    return (
      <Popover
        placement="bottomRight"
        title={
          <>
            <Icon name="cloud-download" /> Download
          </>
        }
        content={
          <>
            Download this {size} file
            <br />
            to your computer.
          </>
        }
      >
        <Button
          size="small"
          type="link"
          href={url}
          onClick={handle_download_click}
          style={{ color: COLORS.GRAY, padding: 0 }}
        >
          {size}
          <Icon name="cloud-download" style={{ color: COLORS.GRAY }} />
        </Button>
      </Popover>
    );
  }

  const row_styles: CSS = {
    cursor: "pointer",
    borderRadius: "4px",
    backgroundColor: props.color,
    borderStyle: "solid",
    borderColor: props.selected ? "#08c" : "transparent",
    margin: "1px 1px 1px 1px",
  } as const;

  // See https://github.com/sagemathinc/cocalc/issues/1020
  // support right-click → copy url for the download button
  const url = url_href(
    props.actions.project_id,
    full_path(),
    props.computeServerId,
  );

  return (
    <Row
      style={row_styles}
      onMouseDown={handle_mouse_down}
      className={props.no_select ? "noselect" : undefined}
    >
      <Col sm={2} xs={6} style={{ textAlign: "center" }}>
        {!student_project_functionality.disableActions && (
          <FileCheckbox
            name={props.name}
            checked={props.checked}
            current_path={props.current_path}
            actions={props.actions}
            style={{ verticalAlign: "sub", color: "#888" }}
          />
        )}
      </Col>
      <Col sm={2} xs={6} style={{ textAlign: "center" }}>
        {render_public_file_info()}
      </Col>
      <Col sm={2} xs={12} onClick={handle_click}>
        {render_icon()}
      </Col>
      <Col sm={1} xs={6} style={{ textAlign: "center" }}>
        {render_star()}
      </Col>
      <Col sm={10} xs={24} onClick={handle_click}>
        <VisibleXS>
          <span style={{ marginLeft: "16px" }} />
        </VisibleXS>
        {render_name()}
      </Col>
      <Col
        sm={7}
        xs={24}
        style={{
          paddingRight:
            "16px" /* otherwise cloud download is too close to edge or cut off */,
        }}
      >
        <VisibleXS>
          <span style={{ marginLeft: "16px" }} />
        </VisibleXS>
        {render_timestamp()}
        {props.isdir ? (
          <>
            <DirectorySize size={props.size} />
          </>
        ) : (
          <span className="pull-right" style={{ color: COLORS.GRAY_M }}>
            {render_download_button(url)}
            {render_view_button(url, props.name)}
          </span>
        )}
      </Col>
    </Row>
  );
});

const directory_size_style: React.CSSProperties = {
  color: COLORS.GRAY,
  marginRight: "3em",
} as const;

function DirectorySize({ size }) {
  if (size == undefined) {
    return null;
  }

  return (
    <span className="pull-right" style={directory_size_style}>
      {size} {misc.plural(size, "item")}
    </span>
  );
}
