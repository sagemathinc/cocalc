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
import { type DirectoryListing } from "@cocalc/frontend/project/explorer/types";
import { FILE_ITEM_OPENED_STYLE } from "@cocalc/frontend/project/page/flyouts/file-list-item";
import { isISODate } from "@cocalc/util/misc";

export const VIEWABLE_FILE_EXT: Readonly<string[]> = [
  "md",
  "txt",
  "html",
  "pdf",
  "png",
  "jpeg",
] as const;

interface Props {
  isDir: boolean;
  name: string;
  // if given, will display this, and will show true filename in popover
  display_name?: string;
  size: number;
  mtime: number;
  isSymLink: boolean;
  checked: boolean;
  selected: boolean;
  color: string;
  mask: boolean;
  isPublic: boolean;
  isOpen: boolean;
  current_path: string;
  actions: ProjectActions;
  no_select: boolean;
  linkTarget?: string;
  listing: DirectoryListing;
  isStarred?: boolean;
  onToggleStar?: (path: string, starred: boolean) => void;
  onOpenSpecial?: (path: string, isDir: boolean) => boolean;
}

export function FileRow({
  isDir,
  name,
  display_name,
  size,
  mtime,
  checked,
  selected,
  color,
  mask,
  isPublic,
  isOpen,
  current_path,
  actions,
  no_select,
  linkTarget,
  listing,
  isStarred,
  onToggleStar,
  onOpenSpecial,
}: Props) {
  const student_project_functionality = useStudentProjectFunctionality(
    actions.project_id,
  );
  const [selection_at_last_mouse_down, set_selection_at_last_mouse_down] =
    useState<string | undefined>(undefined);

  function render_icon() {
    const style: React.CSSProperties = {
      color: mask ? "#bbbbbb" : COLORS.FILE_ICON,
      verticalAlign: "sub",
    } as const;
    let body: React.JSX.Element;
    if (isDir) {
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
      const info = file_options(name);
      const iconName: IconName = info?.icon ?? "file";

      body = <Icon name={iconName} style={{ fontSize: "14pt" }} />;
    }

    return <a style={style}>{body}</a>;
  }

  function render_name_link(styles, name, ext) {
    return (
      <a style={styles} cocalc-test="file-line">
        {misc.trunc_middle(name, 50)}
        <span style={{ color: !mask ? COLORS.FILE_EXT : undefined }}>
          {ext === "" ? "" : `.${ext}`}
        </span>
        {linkTarget != null && linkTarget != name && (
          <>
            {" "}
            <Icon name="arrow-right" style={{ margin: "0 10px" }} />{" "}
            {linkTarget}{" "}
          </>
        )}
        {isISODate(name) && (
          <span style={{ marginLeft: "30px", color: "#666" }}>
            (<TimeAgo date={name} />)
          </span>
        )}
      </a>
    );
  }

  function render_name() {
    let name0 = display_name ?? name;
    let ext: string;
    if (isDir) {
      ext = "";
    } else {
      const name_and_ext = misc.separate_file_extension(name0);
      ({ name: name0, ext } = name_and_ext);
    }

    const show_tip =
      (display_name != undefined && name0 !== display_name) ||
      name0.length > 50;

    const style = {
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
      overflowWrap: "break-word",
      verticalAlign: "middle",
      color: mask ? "#bbbbbb" : COLORS.TAB,
      ...(isOpen ? FILE_ITEM_OPENED_STYLE : undefined),
      backgroundColor: undefined,
    };

    if (show_tip) {
      return (
        <Tip
          title={
            display_name
              ? "Displayed filename is an alias. The actual name is:"
              : "Full name"
          }
          tip={name0}
        >
          {render_name_link(style, name0, ext)}
        </Tip>
      );
    } else {
      return render_name_link(style, name0, ext);
    }
  }

  const generate_on_share_click = memoizeOne((full_path: string) => {
    return generate_click_for("share", full_path, actions);
  });

  function render_public_file_info() {
    if (isPublic) {
      return <PublicButton on_click={generate_on_share_click(full_path())} />;
    }
  }

  function render_star() {
    if (!onToggleStar) return null;
    const path = full_path();
    const starred = isStarred ?? false;
    const iconName = starred ? "star-filled" : "star";

    return (
      <Icon
        name={iconName}
        onClick={(e) => {
          e?.preventDefault();
          e?.stopPropagation();
          onToggleStar?.(path, !starred);
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
    return misc.path_to_file(current_path, name);
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
    const path = full_path();
    if (onOpenSpecial?.(path, isDir)) {
      return;
    }
    if (isDir) {
      actions.open_directory(full_path());
      actions.set_file_search("");
    } else {
      const foreground = should_open_in_foreground(e);
      track("open-file", {
        project_id: actions.project_id,
        path,
        how: "click-on-listing",
      });
      actions.open_file({
        path,
        foreground,
        explicit: true,
      });
      if (foreground) {
        // delay slightly since it looks weird to see the full listing right when you click on a file
        setTimeout(() => actions.set_file_search(""), 10);
      }
    }
  }

  function handle_download_click(e) {
    e.preventDefault();
    e.stopPropagation();
    actions.download_file({
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
          date={new Date(mtime).toISOString()}
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
    if (isDir) return;
    // size=-1 is used for "we do not know size" in some places in code
    const displaySize = (size ?? -1) < 0 ? "" : misc.human_readable_size(size);
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
            Download this {displaySize} file
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
          {displaySize}
          <Icon name="cloud-download" style={{ color: COLORS.GRAY }} />
        </Button>
      </Popover>
    );
  }

  const row_styles: CSS = {
    cursor: "pointer",
    borderRadius: "4px",
    backgroundColor: color,
    borderStyle: "solid",
    borderColor: selected ? "#08c" : "transparent",
    margin: "1px 1px 1px 1px",
  } as const;

  // See https://github.com/sagemathinc/cocalc/issues/1020
  // support right-click → copy url for the download button
  const url = url_href(actions.project_id, full_path());

  return (
    <Row
      style={row_styles}
      onMouseDown={handle_mouse_down}
      className={no_select ? "noselect" : undefined}
    >
      <Col sm={2} xs={6} style={{ textAlign: "center" }}>
        {!student_project_functionality.disableActions && (
          <FileCheckbox
            name={name}
            checked={checked}
            current_path={current_path}
            actions={actions}
            style={{ verticalAlign: "sub", color: "#888" }}
            listing={listing}
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
        {!isDir && (
          <span className="pull-right" style={{ color: COLORS.GRAY_M }}>
            {render_download_button(url)}
            {render_view_button(url, name)}
          </span>
        )}
      </Col>
    </Row>
  );
}
