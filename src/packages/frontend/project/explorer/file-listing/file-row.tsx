/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import memoizeOne from "memoize-one";
import { React, useState, CSS } from "@cocalc/frontend/app-framework";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { CopyButton } from "./copy-button";
import { PublicButton } from "./public-button";
import { FileCheckbox } from "./file-checkbox";
import { generate_click_for } from "./utils";
import { TimeAgo, Tip, Icon, IconName } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { Row, Col } from "react-bootstrap";
import { Button, Popover } from "antd";
import * as misc from "@cocalc/util/misc";
import { url_href } from "../../utils";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { open_new_tab } from "@cocalc/frontend/misc";

const VIEWABLE_FILE_EXT: Readonly<string[]> = [
  "md",
  "txt",
  "html",
  "pdf",
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
  public_view: boolean;
  link_target?: string;
}

export const FileRow: React.FC<Props> = React.memo((props) => {
  const student_project_functionality = useStudentProjectFunctionality(
    props.actions.project_id
  );
  const [selection_at_last_mouse_down, set_selection_at_last_mouse_down] =
    useState<string | undefined>(undefined);

  function render_icon() {
    const style: React.CSSProperties = {
      color: props.mask ? "#bbbbbb" : undefined,
      verticalAlign: "sub",
    } as const;
    let body: JSX.Element;
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
        <span style={{ fontWeight: props.mask ? "normal" : "bold" }}>
          {misc.trunc_middle(name, 50)}
        </span>
        <span style={{ color: !props.mask ? "#999" : undefined }}>
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
      color: props.mask ? "#bbbbbb" : undefined,
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

  const generate_on_copy_click = memoizeOne((full_path: string) => {
    return generate_click_for("copy", full_path, props.actions);
  });

  const generate_on_share_click = memoizeOne((full_path: string) => {
    return generate_click_for("share", full_path, props.actions);
  });

  function render_public_file_info() {
    if (props.public_view) {
      return <CopyButton on_click={generate_on_copy_click(full_path())} />;
    } else if (props.is_public) {
      return <PublicButton on_click={generate_on_share_click(full_path())} />;
    }
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
      const foreground = misc.should_open_in_foreground(e);
      props.actions.open_file({
        path: full_path(),
        foreground,
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
          style={{ color: "#666" }}
        />
      );
    } catch (error) {
      return (
        <div style={{ color: "#666", display: "inline" }}>
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
          placement="bottomRight"
          content={<>Click to view this file in a new tab.</>}
        >
          <Button
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
        <Button type="link" style={{ ...style, visibility: "hidden" }}>
          {icon}
        </Button>
      );
    }
  }

  function render_download_button(url_href) {
    if (student_project_functionality.disableActions) return;
    const size = misc.human_readable_size(props.size);
    // TODO: This really should not be in the size column...
    return (
      <Popover
        placement="bottomRight"
        content={
          <>
            Click to download {size}
            <br />
            to store this file in your own files.
          </>
        }
      >
        <Button
          type="link"
          href={`${url_href}`}
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
  };

  // See https://github.com/sagemathinc/cocalc/issues/1020
  // support right-click → copy url for the download button
  const url = url_href(props.actions.project_id, full_path());

  return (
    <Row
      style={row_styles}
      onMouseDown={handle_mouse_down}
      onClick={handle_click}
      className={props.no_select ? "noselect" : undefined}
    >
      <Col sm={2} xs={3}>
        {!student_project_functionality.disableActions && (
          <FileCheckbox
            name={props.name}
            checked={props.checked}
            current_path={props.current_path}
            actions={props.actions}
            style={{ verticalAlign: "sub" }}
          />
        )}
        {render_public_file_info()}
      </Col>
      <Col sm={1} xs={3}>
        {render_icon()}
      </Col>
      <Col sm={4} smPush={5} xs={6}>
        {render_timestamp()}
        {props.isdir ? (
          <>
            <DirectorySize size={props.size} />
          </>
        ) : (
          <span className="pull-right" style={{ color: "#666" }}>
            {render_download_button(url)}
            {render_view_button(url, props.name)}
          </span>
        )}
      </Col>
      <Col sm={5} smPull={4} xs={12}>
        {render_name()}
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
