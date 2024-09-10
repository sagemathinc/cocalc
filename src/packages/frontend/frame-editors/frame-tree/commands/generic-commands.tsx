/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Input } from "antd";
import { debounce } from "lodash";
import { useEffect, useRef } from "react";
import { defineMessage, IntlShape } from "react-intl";

import { set_account_table } from "@cocalc/frontend/account/util";
import { redux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { IS_MACOS } from "@cocalc/frontend/feature";
import { FORMAT_SOURCE_ICON } from "@cocalc/frontend/frame-editors/frame-tree/config";
import {
  redo as chatRedo,
  undo as chatUndo,
} from "@cocalc/frontend/frame-editors/generic/chat";
import { get_default_font_size } from "@cocalc/frontend/frame-editors/generic/client";
import { labels, menu } from "@cocalc/frontend/i18n";
import { editor } from "@cocalc/frontend/i18n/common";
import { open_new_tab as openNewTab } from "@cocalc/frontend/misc/open-browser-tab";
import { isSupportedExtension } from "@cocalc/frontend/project/page/home-page/ai-generate-examples";
import { AI_GENERATE_DOC_TAG } from "@cocalc/frontend/project/page/home-page/ai-generate-utils";
import openSupportTab from "@cocalc/frontend/support/open";
import userTracking from "@cocalc/frontend/user-tracking";
import { filename_extension } from "@cocalc/util/misc";
import { addCommands } from "./commands";
import { SEARCH_COMMANDS } from "./const";

addCommands({
  "split-row": {
    group: "frame-control",
    alwaysShow: true,
    pos: 1,
    title: defineMessage({
      id: "command.generic.split_row.title",
      defaultMessage: "Split frame horizontally into two rows",
    }),
    onClick: ({ props }) => {
      if (props.is_full) {
        return props.actions.unset_frame_full();
      } else {
        return props.actions.split_frame("row", props.id);
      }
    },
    icon: "horizontal-split",
    label: labels.split_frame_horizontally_title,
    button: menu.split,
  },
  "split-col": {
    group: "frame-control",
    alwaysShow: true,
    pos: 2,
    title: labels.split_frame_vertically_title,
    onClick: ({ props }) => {
      if (props.is_full) {
        return props.actions.unset_frame_full();
      } else {
        return props.actions.split_frame("col", props.id);
      }
    },
    icon: "vertical-split",
    label: defineMessage({
      id: "command.generic.split_col.label",
      defaultMessage: "Split Right",
      description: "Split a frame vertically",
    }),
    button: menu.split,
  },
  maximize: {
    group: "frame-control",
    alwaysShow: true,
    pos: 3,
    title: defineMessage({
      id: "command.generic.maximize.title",
      defaultMessage: "Toggle whether or not this frame is maximized",
    }),
    onClick: ({ props }) => {
      if (props.is_full) {
        props.actions.unset_frame_full();
      } else {
        props.actions.set_frame_full(props.id);
      }
    },
    label: ({ props, intl }) =>
      intl.formatMessage(
        {
          id: "command.generic.maximize.label",
          defaultMessage:
            "{is_full, select, true {Demaximize Frame} other {Maximize Frame}}",
          description:
            "Depending on is_full, say maximize or de-maximize frame.",
        },
        {
          is_full: props.is_full,
        },
      ),
    icon: "expand",
  },
  close: {
    group: "frame-control",
    alwaysShow: true,
    pos: 4,
    title: defineMessage({
      id: "command.generic.close.title",
      defaultMessage:
        "Close this frame. To restore the default layout, select the application menu entry 'Default Layout'.",
    }),
    onClick: ({ props }) => {
      props.actions.close_frame(props.id);
    },
    label: defineMessage({
      id: "command.generic.close.label",
      defaultMessage: "Close Frame",
    }),
    button: defineMessage({
      id: "command.generic.close.button",
      defaultMessage: "Close",
    }),
    icon: "times",
  },
  show_table_of_contents: {
    group: "show-frames",
    title: defineMessage({
      id: "command.generic.show_table_of_contents.title",
      defaultMessage: "Show the Table of Contents",
    }),
    icon: "align-right",
    label: editor.table_of_contents_name,
    button: defineMessage({
      id: "command.generic.show_table_of_contents.button",
      defaultMessage: "Contents",
    }),
  },
  guide: {
    group: "show-frames",
    title: "Show guidebook",
    onClick: ({ props }) => {
      props.actions.guide(props.id, props.type);
    },
    label: "Guide",
    icon: "magic",
  },
  show_search: {
    group: "find",
    pos: 0,
    title: "Show panel for searching in this document",
    label: "Search",
    icon: "search",
  },
  show_overview: {
    group: "show-frames",
    title: "Show overview of all pages",
    label: "Overview",
    icon: "overview",
  },
  show_pages: {
    group: "show-frames",
    title: "Show all pages of this document",
    label: "Pages",
    icon: "pic-centered",
  },
  show_slideshow: {
    group: "show-frames",
    title: "Display Slideshow Presentation",
    label: "Slideshow",
    icon: "play-square",
  },
  show_speaker_notes: {
    group: "show-frames",
    title: "Show Speaker Notes",
    label: "Speaker Notes",
    icon: "pencil",
  },
  shell: {
    group: "show-frames",
    title: "Open a terminal for running code",
    icon: "terminal",
    disable: "disableTerminals",
    label: "Shell",
  },
  terminal: {
    group: "show-frames",
    title: "Open a command line terminal for interacting with the Linux prompt",
    icon: "terminal",
    disable: "disableTerminals",
    label: "Terminal",
  },
  decrease_font_size: {
    stayOpenOnClick: true,
    pos: 1,
    group: "zoom",
    title: defineMessage({
      id: "command.generic.decrease_font_size.title",
      defaultMessage: "Decrease Font Size",
    }),
    icon: "search-minus",
    label: defineMessage({
      id: "command.generic.decrease_font_size.label",
      defaultMessage: "Zoom Out",
    }),
    keyboard: "control + <",
    button: defineMessage({
      id: "command.generic.decrease_font_size.button",
      defaultMessage: "Smaller",
    }),
  },
  increase_font_size: {
    stayOpenOnClick: true,
    pos: 0,
    group: "zoom",
    title: defineMessage({
      id: "command.generic.increase_font_size.title",
      defaultMessage: "Increase Font Size",
    }),
    icon: "search-plus",
    label: defineMessage({
      id: "command.generic.increase_font_size.label",
      defaultMessage: "Zoom In",
    }),
    keyboard: "control + >",
    button: defineMessage({
      id: "command.generic.increase_font_size.button",
      defaultMessage: "Bigger",
    }),
  },
  zoom_page_width: {
    pos: 3,
    group: "zoom",
    title: defineMessage({
      id: "command.generic.zoom_page_width.title",
      defaultMessage: "Zoom to page width",
    }),
    label: defineMessage({
      id: "command.generic.zoom_page_width.label",
      defaultMessage: "Zoom to Width",
    }),
    icon: "ColumnWidthOutlined",
  },
  zoom_page_height: {
    pos: 4,
    group: "zoom",
    title: defineMessage({
      id: "command.generic.zoom_page_height.title",
      defaultMessage: "Zoom to page height",
    }),
    label: defineMessage({
      id: "command.generic.zoom_page_height.label",
      defaultMessage: "Zoom to Height",
    }),
    icon: "ColumnHeightOutlined",
  },
  set_zoom: {
    pos: 5,
    group: "zoom",
    title: "Zoom to a preset size",
    label: ({ props }) => (
      <span>
        {props.font_size == null
          ? "Set Zoom"
          : `${Math.round((100 * props.font_size) / get_default_font_size())}%`}
      </span>
    ),
    onClick: () => {},
    icon: "percentage",
    children: [50, 85, 100, 115, 125, 150, 200].map((zoom) => {
      return {
        stayOpenOnClick: true,
        label: `${zoom}%`,
        onClick: ({ props }) => {
          // console.log("set_zoom", { zoom }, zoom / 100, props.id);
          props.actions.set_zoom(zoom / 100, props.id);
        },
      };
    }),
  },
  undo: {
    disabled: ({ readOnly }) => readOnly,
    stayOpenOnClick: true,
    group: "undo-redo",
    pos: 0,
    icon: "undo",
    label: labels.undo,
    keyboard: `${IS_MACOS ? "⌘" : "control"} + Z`,
    onClick: ({ props }) => {
      if (props.type == "chat") {
        // we have to special case this until we come up with a better way of having
        // different kinds of actions for other frames.
        chatUndo(props.project_id, props.path);
      } else {
        props.editor_actions.undo(props.id);
      }
    },
  },
  redo: {
    disabled: ({ readOnly }) => readOnly,
    stayOpenOnClick: true,
    group: "undo-redo",
    pos: 1,
    icon: "redo",
    label: labels.redo,
    keyboard: `${IS_MACOS ? "⌘" : "control"} + shift + Z`,
    onClick: ({ props }) => {
      if (props.type == "chat") {
        // see undo comment above
        chatRedo(props.project_id, props.path);
      } else {
        props.editor_actions.redo(props.id);
      }
    },
  },
  cut: {
    group: "copy",
    pos: 0,
    label: labels.cut,
    title: "Cut selection",
    icon: "scissors",
    keyboard: `${IS_MACOS ? "⌘" : "control"} + X`,
    disabled: ({ readOnly }) => readOnly,
  },
  copy: {
    group: "copy",
    pos: 1,
    label: labels.copy,
    title: "Copy selection",
    icon: "copy",
    keyboard: `${IS_MACOS ? "⌘" : "control"} + C`,
  },
  paste: {
    group: "copy",
    pos: 2,
    label: labels.paste,
    title: "Paste buffer",
    icon: "paste",
    keyboard: `${IS_MACOS ? "⌘" : "control"} + V`,
    disabled: ({ readOnly }) => readOnly,
    onClick: debounce(
      ({ props }) => props.editor_actions.paste(props.id, true),
      200,
      {
        leading: true,
        trailing: false,
      },
    ),
  },

  edit_init_script: {
    group: "config",
    label: defineMessage({
      id: "command.generic.edit_init_script.label",
      defaultMessage: "Initialization Script",
    }),
    title: defineMessage({
      id: "command.generic.edit_init_script.title",
      defaultMessage:
        "Edit the initialization script that is run when this starts",
    }),
    icon: "rocket",
    tour: "edit_init_script",
  },

  help: {
    pos: 0,
    group: "help-link",
    label: "Documentation",
    icon: "question-circle",
    title: "Show documentation for working with this editor",
    tour: "help",
  },

  clear: {
    group: "action",
    button: "Clear",
    label: "Clear Frame",
    icon: <Icon unicode={0x2620} />,
    popconfirm: {
      title: "Clear this frame?",
    },
  },

  pause: {
    group: "action",
    button: "Pause",
    icon: "pause",
    label: ({ props }) => {
      if (props.is_paused) {
        return (
          <div
            style={{
              display: "inline-block",
              background: "green",
              color: "white",
              padding: "0 20px",
            }}
          >
            Resume
          </div>
        );
      }
      return <span>Pause</span>;
    },
    title: "Pause this frame temporarily",
    onClick: ({ props }) => {
      if (props.is_paused) {
        props.actions.unpause(props.id);
      } else {
        props.actions.pause(props.id);
      }
    },
  },

  restart: {
    group: "action",
    icon: "sync",
    label: "Restart Server",
    title: "Restart the backend service",
  },

  kick_other_users_out: {
    group: "other-users",
    icon: "skull-crossbones",
    title: menu.kick_other_users_out_title,
    tour: "kick_other_users_out",
    label: menu.kick_other_users_out_label,
    button: menu.kick_other_users_out_button,
  },

  halt_jupyter: {
    group: "quit",
    icon: "PoweroffOutlined",
    label: menu.close_and_halt,
    button: menu.halt_jupyter_button,
    title: menu.halt_jupyter_title,
  },

  close_and_halt: {
    group: "quit",
    icon: "PoweroffOutlined",
    label: menu.close_and_halt,
    title: "Halt backend server and close this file.",
  },

  reload: {
    group: "reload",
    icon: "reload",
    label: labels.reload,
    title: labels.reload_title,
  },

  time_travel: {
    group: "show-frames",
    pos: 3,
    icon: "history",
    label: labels.timetravel,
    title: labels.timetravel_title,
    onClick: ({ props, event }) => {
      if (props.actions.name != props.editor_actions.name) {
        // a subframe editor -- always open time travel in a name tab.
        props.editor_actions.time_travel({ frame: false });
        return;
      }
      // If a time_travel frame type is available and the
      // user does NOT shift+click, then open as a frame.
      // Otherwise, it opens as a new tab.
      const frame = !event.shiftKey && props.editor_spec["time_travel"] != null;
      props.actions.time_travel({
        frame,
      });
    },
  },
  find: {
    group: "find",
    pos: 0,
    label: "Find",
    icon: "search",
    keyboard: `${IS_MACOS ? "⌘" : "control"} + F`,
  },
  replace: {
    group: "find",
    pos: 0,
    label: "Replace",
    icon: "replace",
    disabled: ({ readOnly }) => readOnly,
  },
  goto_line: {
    group: "find",
    pos: 3,
    label: "Goto Line",
    button: "Line",
    icon: "bolt",
    keyboard: `${IS_MACOS ? "⌘" : "control"} + L`,
  },
  auto_indent: {
    group: "code-format",
    label: "Auto Indent",
    button: "Indent",
    title: "Automatically indent selected code",
    disabled: ({ readOnly }) => readOnly,
    icon: "indent",
  },
  format: {
    group: "code-format",
    label: "Format Source Code",
    button: "Format",
    title: "Syntactically format using a parser such as prettier.",
    icon: FORMAT_SOURCE_ICON,
    keyboard: `${IS_MACOS ? "⌘" : "control"} + shift + F`,
  },

  build: {
    group: "build",
    label: defineMessage({
      id: "command.generic.build.label",
      defaultMessage: "Build",
    }),
    title: defineMessage({
      id: "command.generic.build.title",
      defaultMessage:
        "Build the document.{br}To enable or disable automatic builds, click on the 'Build on Save' button or menu entry.",
    }),
    icon: "play-circle",
  },
  build_on_save: {
    group: "build",
    label: ({ intl }) =>
      intl.formatMessage(
        {
          id: "command.generic.build_on_save.label",
          defaultMessage:
            "Build on Save {enabled, select, true {(Enabled)} other {(Disabled)}}",
        },
        {
          enabled: redux
            .getStore("account")
            .getIn(["editor_settings", "build_on_save"]),
        },
      ),
    title: defineMessage({
      id: "command.generic.build_on_save.title",
      defaultMessage: "Toggle automatic build on file save.",
    }),
    icon: () =>
      redux.getStore("account").getIn(["editor_settings", "build_on_save"])
        ? "delivered-procedure-outlined"
        : "stop-filled",
  },
  force_build: {
    group: "build",
    label: defineMessage({
      id: "command.generic.force_build.label",
      defaultMessage: "Force Build",
    }),
    title: defineMessage({
      id: "command.generic.force_build.title",
      defaultMessage: "Force rebuild entire project.",
    }),
    icon: "play",
  },
  stop_build: {
    group: "build",
    // TODO does not react to changes
    // disabled: ({ props }) => props.editor_actions.is_running !== true,
    label: defineMessage({
      id: "command.generic.stop_build.label",
      defaultMessage: "Stop",
    }),
    title: defineMessage({
      id: "command.generic.stop_build.title",
      defaultMessage: "Stop all running jobs.",
    }),
    icon: "stop",
  },
  clean: {
    group: "build",
    label: "Delete Aux Files",
    title: "Delete all temporary files left around from builds",
    icon: "trash",
  },

  rescan_latex_directive: {
    group: "scan",
    label: "Scan for Build Directives",
    title: (
      <>
        Rescan the document for build directives, starting{" "}
        <code>'% !TeX program = xelatex, pdflatex, etc'</code> or{" "}
        <code>'% !TeX cocalc = exact command line'</code>
      </>
    ),
    icon: "reload",
  },
  sync: {
    group: "show-frames",
    button: "Sync",
    label: defineMessage({
      id: "command.generic.sync.label",
      defaultMessage: "Synchronize Views",
      description: "Synchronize the LaTeX source view with the PDF output",
    }),
    keyboard: `${IS_MACOS ? "⌘" : "alt"} + enter`,
    title: defineMessage({
      id: "command.generic.sync.title",
      defaultMessage: "Synchronize the LaTeX source view with the PDF output.",
    }),
    icon: "sync",
    onClick: ({ props }) => {
      props.actions.sync?.(props.id, props.editor_actions);
    },
  },
  export_to_markdown: {
    group: "export",
    label: "Export to Markdown",
    title:
      "Create and open a markdown version of current view of this document.",
    icon: "markdown",
  },

  word_count: {
    group: "get-info",
    label: labels.word_count,
    title: defineMessage({
      id: "command.generic.word_count.title",
      defaultMessage:
        "Show information about the number of words in this document.",
      description: "Tooltip for 'Word Count'",
    }),
    icon: "file-alt",
    onClick: ({ props }) => {
      props.actions.word_count?.(0, true);
    },
  },

  tour: {
    group: "tour",
    label: "Take the Tour",
    title: "Take a guided tour of the user interface for this editor.",
    icon: "map",
    neverVisibleOnMobile: true,
    onClick: ({ props }) => {
      userTracking("tour", { name: `frame-${props.type}` });
      props.actions.set_frame_full(props.id);
      // we have to wait until the frame renders before
      // setting the tour; otherwise, the references won't
      // be defined and it won't work.
      setTimeout(
        () => props.actions.set_frame_tree({ id: props.id, tour: true }),
        1,
      );
    },
  },

  readonly_view: {
    pos: -1,
    group: "show-frames",
    icon: "lock",
    title:
      "This is an editable view of the document. You can edit it directly.  Select this option to switch to a read only view.",
    label: "Switch to Readonly View",
    button: "Lock",
    onClick: ({ props }) => {
      props.actions["readonly_view"]?.(props.id);
    },
  },

  edit: {
    pos: -1,
    group: "show-frames",
    icon: "pencil",
    title:
      "This is a readonly view of the document.  Select this option to switch to a directly editable view.",
    label: "Switch to Editable View",
    button: "Edit",
    onClick: ({ props }) => props.actions["edit"]?.(props.id),
  },

  delete: {
    disabled: ({ readOnly }) => readOnly,
    group: "delete",
    icon: "trash",
    title: defineMessage({
      id: "menu.generic.delete.tooltip",
      defaultMessage: "Delete this file",
    }),
    label: defineMessage({
      id: "menu.generic.delete.label",
      defaultMessage: "Delete File",
    }),
    ...fileAction("delete"),
  },

  rename: {
    disabled: ({ readOnly }) => readOnly,
    pos: 0,
    group: "misc-file-actions",
    icon: "swap",
    title: "Rename this file",
    label: defineMessage({
      id: "menu.generic.rename.label",
      defaultMessage: "Rename File",
    }),
    ...fileAction("rename"),
  },
  compress: {
    pos: 1,
    group: "misc-file-actions",
    icon: "compress",
    title: "Compress this file",
    label: defineMessage({
      id: "menu.generic.compress.label",
      defaultMessage: "Compress File",
    }),
    ...fileAction("compress"),
  },
  duplicate: {
    pos: 2,
    group: "misc-file-actions",
    icon: "clone",
    title: "Duplicate this file",
    label: defineMessage({
      id: "menu.generic.duplicate.label",
      defaultMessage: "Duplicate File",
    }),
    ...fileAction("duplicate"),
  },
  copy_file: {
    pos: 3,
    group: "misc-file-actions",
    icon: "files",
    title: defineMessage({
      id: "menu.generic.copy_file.tooltip",
      defaultMessage: "Copy this file to another directory or project",
    }),
    label: defineMessage({
      id: "menu.generic.copy_file.label",
      defaultMessage: "Copy File",
    }),
    ...fileAction("copy"),
  },
  move_file: {
    disabled: ({ readOnly }) => readOnly,
    pos: 4,
    group: "misc-file-actions",
    icon: "move",
    title: defineMessage({
      id: "menu.generic.move_file.tooltip",
      defaultMessage: "Move this file to another directory",
    }),
    label: defineMessage({
      id: "menu.generic.move_file.label",
      defaultMessage: "Move File",
    }),
    ...fileAction("move"),
  },
  download: {
    group: "export",
    label: defineMessage({
      id: "menu.generic.download.label",
      defaultMessage: "Download File",
    }),
    title: defineMessage({
      id: "menu.generic.download.tooltip",
      defaultMessage: "Download this file",
    }),
    icon: "cloud-download",
    ...fileAction("download"),
  },
  download_pdf: {
    group: "export",
    label: "Download PDF",
    title: "Download the PDF file",
    icon: "cloud-download",
  },
  upload: {
    pos: 10,
    group: "misc-file-actions",
    icon: "upload",
    title: "Upload a file or directory from your compute to the server",
    label: labels.upload,
    ...fileAction("upload"),
  },
  share: {
    pos: 10,
    group: "export",
    icon: "share-square",
    title: defineMessage({
      id: "menu.generic.publish_file.tooltip",
      defaultMessage:
        "Make this file available to be easily copies by other people, either publicly or for people who know the link.",
    }),
    button: defineMessage({
      id: "menu.generic.publish_file.button",
      defaultMessage: "Publish",
    }),
    label: defineMessage({
      id: "menu.generic.publish_file.label",
      defaultMessage: "Publish File",
    }),
    ...fileAction("share"),
  },
  print: {
    pos: 2,
    group: "export",
    icon: "print",
    title: defineMessage({
      id: "menu.generic.print.tooltip",
      defaultMessage:
        "Show a printable version of this document in a popup window.",
    }),

    label: labels.print,
  },
  new: {
    pos: 0,
    group: "new-open",
    icon: "plus-circle",
    title: "Create a new file",
    label: menu.new_file,
    ...fileAction("new"),
  },
  new_ai: {
    pos: 0.5,
    group: "new-open",
    icon: <AIAvatar size={16} />,
    title: labels.ai_generate_title,
    label: labels.ai_generate_label,
    onClick: ({ setShowNewAI }) => setShowNewAI?.(true),
    isVisible: ({ props }) => {
      const { path, project_id } = props;
      const ext = filename_extension(path);
      if (!isSupportedExtension(ext)) return false;
      return redux
        .getStore("projects")
        .hasLanguageModelEnabled(project_id, AI_GENERATE_DOC_TAG);
    },
  },
  open: {
    pos: 1,
    group: "new-open",
    icon: "files",
    title: defineMessage({
      id: "command.generic.open.title",
      defaultMessage: "Open a file",
      description: "Tooltip on menu item",
    }),
    label: defineMessage({
      id: "command.generic.open.label",
      defaultMessage: "Open File",
      description: "Label on menu item",
    }),
    ...fileAction("open"),
  },
  open_recent: {
    pos: 2,
    group: "new-open",
    icon: "history",
    title: defineMessage({
      id: "command.generic.open_recent.title",
      defaultMessage: "Open a file that was recently opened",
      description: "Tooltip on menu item",
    }),
    label: defineMessage({
      id: "command.generic.open_recent.label",
      defaultMessage: "Open Recent",
      description: "Label on menu item",
    }),
    ...fileAction("open_recent"),
  },
  save: {
    pos: 0,
    disabled: ({ readOnly }) => readOnly,
    group: "save",
    icon: "save",
    title: labels.save_title,
    label: labels.save,
    keyboard: `${IS_MACOS ? "⌘" : "control"} + S`,
  },
  chatgpt: {
    pos: 1,
    group: "show-frames",
    icon: <AIAvatar size={16} />,
    title: defineMessage({
      id: "command.generic.chatgpt.title",
      defaultMessage:
        "Ask an Artificial Intelligence Assistant (e.g., ChatGPT) for help on what you're doing.",
    }),
    label: defineMessage({
      id: "command.generic.chatgpt.label",
      defaultMessage: "AI Assistant",
    }),
    onClick: ({ setShowAI }) => setShowAI?.(true),
    isVisible: ({ props }) =>
      redux.getStore("projects").hasLanguageModelEnabled(props.project_id),
  },
  chat: {
    alwaysShow: true,
    pos: 5,
    group: "help-link",
    icon: "comment",
    label: "Chat With Collaborators or AI",
    button: "Chat",
    title:
      "Open chat on the side of this file for chatting with project collaborators or AI about this file.",
    onClick: ({ props }) => {
      redux.getProjectActions(props.project_id).open_chat({ path: props.path });
    },
  },
  support: {
    alwaysShow: true,
    pos: 6,
    group: "help-link",
    icon: "medkit",
    label: "Support Ticket",
    button: labels.support,
    title:
      "Create a support ticket.  Ask the people at CoCalc a question, report a bug, etc.",
    onClick: () => {
      openSupportTab();
    },
  },
  videos: {
    alwaysShow: true,
    pos: 10,
    group: "help-link",
    icon: "youtube",
    label: "Videos",
    button: "Videos",
    title: "Browse videos about CoCalc.",
    onClick: () => {
      openNewTab(
        "https://www.youtube.com/playlist?list=PLOEk1mo1p5tJmEuAlou4JIWZFH7IVE2PZ",
      );
    },
  },
  [SEARCH_COMMANDS]: {
    stayOpenOnClick: true,
    alwaysShow: true,
    pos: 0,
    group: "search-commands",
    title: "Search through all commands for this document frame.",
    label: ({ helpSearch, setHelpSearch }) => {
      return (
        <SearchBox helpSearch={helpSearch} setHelpSearch={setHelpSearch} />
      );
    },
    onClick: () => {},
  },
  about: {
    group: "about",
    icon: "info-circle",
    title: "About this application",
    label: "About",
  },
  //   quit: {
  //     pos: 10,
  //     group: "quit",
  //     icon: "PoweroffOutlined",
  //     title: "Quit this editor",
  //     label: "Quit Application",
  //     ...fileAction("quit"),
  //   },
  close_tab: {
    pos: 9,
    group: "quit",
    icon: "times-circle",
    title: "Close this editor",
    label: "Close File",
    button: "Close",
    ...fileAction("close"),
  },
  new_frame_of_type: {
    alwaysShow: true,
    icon: "plus-square",
    group: "frame_types",
    title: "Create a new frame with an editor of the given type",
    label: "New Frame",
    button: "Frame",
    onClick: ({}) => {},
    children: ({ frameTypeCommands }) => frameTypeCommands(true),
  },
  frame_type: {
    alwaysShow: true,
    icon: "frame",
    group: "frame_types",
    title: "Change the type of editor to show in this frame",
    label: "Change Type",
    button: "Type",
    onClick: ({}) => {},
    children: ({ frameTypeCommands }) => frameTypeCommands(false),
  },
  reset_local_view_state: {
    alwaysShow: true,
    icon: "layout",
    group: "frame_types",
    title: defineMessage({
      id: "command.generic.reset_local_view_state.title",
      defaultMessage: "Reset the layout of all frames to the default",
    }),
    label: defineMessage({
      id: "command.generic.reset_local_view_state.label",
      defaultMessage: "Default Layout",
    }),
    button: defineMessage({
      id: "command.generic.reset_local_view_state.button",
      defaultMessage: "Default",
    }),
  },
  button_bar: {
    alwaysShow: true,
    icon: "tool",
    group: "button-bar",
    label: "Menu Toolbar",
    button: "Toolbar",
    children: [
      {
        name: "disable-button-toolbar",
        icon: "trash",
        group: "button-bar",
        title:
          "Disable all buttons just for this editor. This hides the toolbar for this editor only.",
        label: "Remove All Buttons",
        popconfirm: {
          title: "Remove All Buttons",
          description: (
            <div>
              If you disable all buttons just for this editor, then you won't
              see the button toolbar for this editor unless you enable some
              buttons. This does not impact any other editor.
            </div>
          ),
          cancelText: "Cancel",
          okText: "Remove All",
        },
        onClick: (manage) => {
          manage.removeAllToolbarButtons();
        },
      },
      {
        name: "reset-button-toolbar",
        icon: "undo",
        group: "button-bar",
        title:
          "Reset the toolbar for this editor to its default state, removing any buttons you added or removed.",
        label: "Reset to Default",
        popconfirm: {
          title: "Reset Toolbar to Default",
          description: (
            <div>
              If you reset the button toolbar the choice of commands in the
              toolbar for this specific type of editor will revert to the
              default state.
            </div>
          ),
          cancelText: "Cancel",
          okText: "Reset",
        },
        onClick: (manage) => {
          manage.resetToolbar();
        },
      },
    ],
  },

  toggle_button_bar: {
    button: "Buttons",
    alwaysShow: true,
    icon: () =>
      redux.getStore("account").getIn(["editor_settings", "extra_button_bar"])
        ? "eye-slash"
        : "eye",
    group: "button-bar",
    title: defineMessage({
      id: "commands.generic.toggle_button_bar.title",
      defaultMessage:
        "Toggle whether or not the menu toolbar is displayed for all editors.",
    }),
    label: ({ intl }: { intl: IntlShape }) => {
      const show = redux
        .getStore("account")
        .getIn(["editor_settings", "extra_button_bar"]);
      return intl.formatMessage(
        {
          id: "commands.generic.toggle_button_bar.label",
          defaultMessage: `{show, select, true {Hide} other {Show}} Menu Toolbar...`,
        },
        { show },
      );
    },
    popconfirm: ({ intl }: { intl: IntlShape }) => {
      const visible = redux
        .getStore("account")
        .getIn(["editor_settings", "extra_button_bar"]);
      if (!visible) {
        return;
      }
      return {
        title: (
          <>
            <Icon name="eye-slash" />{" "}
            {intl.formatMessage({
              id: "commands.generic.toggle_button_bar.confirm.title",
              defaultMessage: "Hide Menu Toolbar For All Editors",
            })}
          </>
        ),
        description: (
          <div>
            {intl.formatMessage({
              id: "commands.generic.toggle_button_bar.confirm.description",
              defaultMessage: `The menu toolbar is a customizable bar of shortcuts to menu items.
              <ul>
              <li>
                Everything in the menu toolbar is always available in the menus
                above.
              </li>
              <li>
                Show the toolbar by selecting 'View → Show Menu Toolbar'.
              </li>
              <li>
                Toggle buttons by clicking the icon next to any top level menu
                item.
              </li>
              <li>
                Hide only this frame's toolbar: 'View → Menu Toolbar → Remove All Buttons'.
              </li>
              </ul>`,
            })}
          </div>
        ),
        cancelText: intl.formatMessage(labels.cancel),
        okText: intl.formatMessage({
          id: "commands.generic.toggle_button_bar.confirm.ok",
          defaultMessage: "Hide Menu Toolbar",
        }),
      };
    },
    onClick: async () => {
      const visible = redux
        .getStore("account")
        .getIn(["editor_settings", "extra_button_bar"]);
      set_account_table({ editor_settings: { extra_button_bar: !visible } });
    },
  },
});

function fileAction(action) {
  return {
    alwaysShow: true,
    onClick: ({ props }) => {
      const actions = redux.getProjectActions(props.project_id);
      actions.show_file_action_panel({
        path: props.path,
        action,
      });
    },
  };
}

function SearchBox({ setHelpSearch, helpSearch }) {
  const didFocus = useRef<boolean>(false);
  useEffect(() => {
    return () => {
      if (didFocus.current) {
        // make sure it is restored.
        redux.getActions("page").enableGlobalKeyHandler();
      }
    };
  }, []);
  return (
    <Input.Search
      autoFocus
      placeholder="Search"
      allowClear
      value={helpSearch}
      onChange={(e) => setHelpSearch(e.target.value)}
      onFocus={() => {
        didFocus.current = true;
        redux.getActions("page").disableGlobalKeyHandler();
      }}
      onBlur={() => {
        redux.getActions("page").enableGlobalKeyHandler();
      }}
    />
  );
}
