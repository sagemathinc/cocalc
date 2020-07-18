/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useState } from "../../../app-framework";
import memoizeOne from "memoize-one";

import { ProjectActions } from "../../../project_actions";
import { CopyButton } from "./copy-button";
import { PublicButton } from "./public-button";
import { FileCheckbox } from "./file-checkbox";
import { generate_click_for } from "./utils";
import { COLORS, TimeAgo, Tip, Icon } from "../../../r_misc";
const { Button, Row, Col } = require("react-bootstrap");
const misc = require("smc-util/misc");
const { project_tasks } = require("../../../project_tasks");

interface Props {
  isdir: boolean;
  name: string;
  display_name: string; // if given, will display this, and will show true filename in popover
  size: number; // sometimes is NOT known!
  time: number;
  issymlink: boolean;
  checked: boolean;
  bordered: boolean;
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
  const [
    selection_at_last_mouse_down,
    set_selection_at_last_mouse_down,
  ] = useState<string | undefined>(undefined);

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
            name="folder-open-o"
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
      let name: string;
      const { file_options } = require("../../../editor");
      const info = file_options(props.name);
      if (info != undefined) {
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
    const name_and_ext = misc.separate_file_extension(name);
    ({ name } = name_and_ext);
    const { ext } = name_and_ext;

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

  function render_download_button(url_href) {
    // ugly width 2.5em is to line up with blank space for directory.
    // TODO: This really should not be in the size column...
    return (
      <Button
        style={{ marginLeft: "1em", background: "transparent", width: "2.5em" }}
        bsStyle="default"
        bsSize="xsmall"
        href={`${url_href}`}
        onClick={handle_download_click}
      >
        <Icon name="cloud-download" style={{ color: "#666" }} />
      </Button>
    );
  }

  const row_styles = {
    cursor: "pointer",
    borderRadius: "4px",
    backgroundColor: props.color,
    borderStyle: "solid",
    borderColor: props.bordered ? COLORS.BLUE_BG : props.color,
    margin: "1px 1px 1px 1px",
  };

  // See https://github.com/sagemathinc/cocalc/issues/1020
  // support right-click → copy url for the download button
  const url_href = project_tasks(props.actions.project_id).url_href(
    full_path()
  );

  return (
    <Row
      style={row_styles}
      onMouseDown={handle_mouse_down}
      onClick={handle_click}
      className={props.no_select ? "noselect" : undefined}
    >
      <Col sm={2} xs={3}>
        <FileCheckbox
          name={props.name}
          checked={props.checked}
          current_path={props.current_path}
          actions={props.actions}
          style={{ verticalAlign: "sub" }}
        />
        {render_public_file_info()}
      </Col>
      <Col sm={1} xs={3}>
        {render_icon()}
      </Col>
      <Col sm={4} smPush={5} xs={6}>
        {render_timestamp()}
        {props.isdir ? (
          <DirectorySize size={props.size} />
        ) : (
          <span className="pull-right" style={{ color: "#666" }}>
            {misc.human_readable_size(props.size)}
            {render_download_button(url_href)}
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
  color: "#666",
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
