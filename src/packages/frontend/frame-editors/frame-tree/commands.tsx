import { get_default_font_size } from "../generic/client";
import { undo as chatUndo, redo as chatRedo } from "../generic/chat";
import { Icon } from "@cocalc/frontend/components";
import { debounce } from "lodash";
import type { ReactNode } from "react";
import { FORMAT_SOURCE_ICON } from "../frame-tree/config";
import { IS_MACOS } from "@cocalc/frontend/feature";

export const MENUS = {
  file: {
    label: "File",
    pos: 0,
    groups: ["reload", "close"],
  },
  edit: {
    label: "Edit",
    pos: 1,
    groups: ["undo-redo", "find", "copy", "format", "config"],
  },
  view: {
    label: "View",
    pos: 2,
    groups: ["zoom", "frame-control", "show-frames"],
  },
  go: {
    label: "Go",
    pos: 3,
    groups: ["build", "scan", "other-users"],
  },
  help: {
    label: "Help",
    pos: 4,
    groups: ["help-link"],
  },
} as const;

type Group = (typeof MENUS)[keyof typeof MENUS]["groups"][number];

export interface Command {
  // group -- inside of a menu
  group: Group;
  // position, for sorting
  pos?: number;
  title?: JSX.Element | string;
  icon?: JSX.Element | string;
  label: string | (({ props }) => JSX.Element);
  // one of action or onClick must be specified
  action?: string;
  onClick?: ({ props, event }: { props?; event? }) => void;
  disable?: string;
  keyboard?: string;
  children?: Partial<Command>[];
  disabled?: ({ props, read_only }) => boolean;
  // not used yet
  tour?: string;
  confirm?: {
    // popconfirm first
    title?: ReactNode;
    description?: ReactNode;
    okText?: string;
    cancelText?: string;
  };
}

export const COMMANDS: { [command: string]: Command } = {
  "split-row": {
    group: "frame-control",
    pos: 1,
    title: "Split frame horizontally into two rows",
    onClick: ({ props }) => {
      if (props.is_full) {
        return props.actions.unset_frame_full();
      } else {
        return props.actions.split_frame("row", props.id);
      }
    },
    icon: "horizontal-split",
    label: "Split Down",
  },
  "split-col": {
    group: "frame-control",
    pos: 2,
    title: "Split frame vertically into two columns",
    onClick: ({ props }) => {
      if (props.is_full) {
        return props.actions.unset_frame_full();
      } else {
        return props.actions.split_frame("col", props.id);
      }
    },
    icon: "vertical-split",
    label: "Split Right",
  },
  maximize: {
    group: "frame-control",
    pos: 3,
    title: "Toggle whether or not this frame is maximized",
    onClick: ({ props }) => {
      if (props.is_full) {
        props.actions.unset_frame_full();
      } else {
        props.actions.set_frame_full(props.id);
      }
    },
    label: ({ props }) => {
      if (props.is_full) {
        return <span>Demaximize Frame</span>;
      } else {
        return <span>Maximize Frame</span>;
      }
    },
    icon: "expand",
  },
  close: {
    group: "frame-control",
    pos: 4,
    title: "Close this frame. Close all frames to restore the default layout.",
    onClick: ({ props }) => {
      props.actions.close_frame(props.id);
    },
    label: "Close Frame",
    icon: "times",
  },
  "show-table-of-contents": {
    group: "show-frames",
    action: "show_table_of_contents",
    title: "Show the Table of Contents",
    icon: "align-right",
    label: "Table of Contents",
  },
  "show-guide": {
    group: "show-frames",
    action: "guide",
    title: "Show guidebook",
    onClick: ({ props }) => {
      props.actions.guide(props.id, props.type);
    },
    label: "Guide",
    icon: "magic",
  },
  "show-search": {
    group: "find",
    pos: 0,
    action: "show_search",
    title: "Show panel for searching in this document",
    label: "Search",
    icon: "search",
  },
  "show-overview": {
    group: "show-frames",
    action: "show_overview",
    title: "Show overview of all pages",
    label: "Overview",
    icon: "overview",
  },
  "show-pages": {
    group: "show-frames",
    action: "show_pages",
    title: "Show all pages of this document",
    label: "Pages",
    icon: "pic-centered",
  },
  "show-slideshow": {
    group: "show-frames",
    action: "show_slideshow",
    title: "Display Slideshow Presentation",
    label: "Slideshow",
    icon: "play-square",
  },
  "show-speaker-notes": {
    group: "show-frames",
    action: "show_speaker_notes",
    title: "Show Speaker Notes",
    label: "Speaker Notes",
    icon: "pencil",
  },
  "show-shell": {
    group: "show-frames",
    action: "shell",
    title: "Open a terminal for running code",
    icon: "terminal",
    disable: "disableTerminals",
    label: "Shell",
  },
  "show-terminal": {
    group: "show-frames",
    action: "terminal",
    title: "Open a command line terminal for interacting with the Linux prompt",
    icon: "terminal",
    disable: "disableTerminals",
    label: "Terminal",
  },
  "zoom-out": {
    pos: 1,
    group: "zoom",
    action: "decrease_font_size",
    title: "Decrease font size",
    icon: "search-minus",
    label: "Zoom Out",
    keyboard: "control + <",
  },
  "zoom-in": {
    pos: 0,
    group: "zoom",
    action: "increase_font_size",
    title: "Increase font size",
    icon: "search-plus",
    label: "Zoom In",
    keyboard: "control + >",
  },
  "zoom-page-width": {
    pos: 3,
    group: "zoom",
    action: "zoom_page_width",
    title: "Zoom to page width",
    label: "Zoom to Width",
    icon: "ColumnWidthOutlined",
  },
  "zoom-page-height": {
    pos: 4,
    group: "zoom",
    action: "zoom_page_height",
    title: "Zoom to page height",
    label: "Zoom to Height",
    icon: "ColumnHeightOutlined",
  },
  "set-zoom": {
    pos: 5,
    group: "zoom",
    action: "set_zoom",
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
        label: `${zoom}%`,
        onClick: ({ props }) => {
          // console.log("set_zoom", { zoom }, zoom / 100, props.id);
          props.actions.set_zoom(zoom / 100, props.id);
        },
      };
    }),
  },
  undo: {
    group: "undo-redo",
    pos: 0,
    action: "undo",
    icon: "undo",
    label: "Undo",
    keyboard: "control + z",
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
    group: "undo-redo",
    pos: 1,
    action: "redo",
    icon: "redo",
    label: "Redo",
    keyboard: "control + shift + z",
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
    action: "cut",
    label: "Cut",
    title: "Cut selection",
    icon: "scissors",
    keyboard: "control + x",
    disabled: ({ read_only }) => read_only,
  },
  copy: {
    group: "copy",
    pos: 1,
    action: "copy",
    label: "Copy",
    title: "Copy selection",
    icon: "copy",
    keyboard: "control + c",
  },
  paste: {
    group: "copy",
    pos: 2,
    action: "paste",
    label: "Paste",
    title: "Paste buffer",
    icon: "paste",
    keyboard: "control + v",
    disabled: ({ read_only }) => read_only,
    onClick: debounce(
      ({ props }) => props.editor_actions.paste(props.id, true),
      200,
      {
        leading: true,
        trailing: false,
      },
    ),
  },

  "edit-init-script": {
    group: "config",
    action: "edit_init_script",
    label: "Init Script",
    title: "Edit the initialization script that is run when this starts",
    icon: "rocket",
    tour: "edit_init_script",
  },

  "show-help": {
    group: "help-link",
    action: "help",
    label: "Documentation",
    icon: "question-circle",
    title: "Show documentation for working with this editor",
    tour: "help",
  },

  clear: {
    group: "format",
    action: "clear",
    label: "Clear frame",
    icon: <Icon unicode={0x2620} />,
    confirm: {
      title: "Clear this frame?",
    },
  },

  pause: {
    group: "format",
    action: "pause",
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

  "kick-other-users-out": {
    group: "other-users",
    action: "kick_other_users_out",
    icon: "skull-crossbones",
    title:
      "Kick all other users out from this document. It will close in all other browsers.",
    tour: "kick_other_users_out",
    label: "Kick others users out",
  },

  print: {
    group: "show-frames",
    action: "print",
    icon: "print",
    title: "Show a printable version of this document in a popup window.",
    label: "Print",
  },

  "halt-jupyter": {
    group: "close",
    action: "halt_jupyter",
    icon: "PoweroffOutlined",
    label: "Close and Halt",
    title: "Halt the running Jupyter kernel and close this notebook.",
  },

  close_and_halt: {
    group: "close",
    action: "close_and_halt",
    icon: "PoweroffOutlined",
    label: "Close and Halt",
    title: "Halt backend server and close this file.",
  },

  reload: {
    group: "reload",
    action: "reload",
    icon: "reload",
    label: "Reload",
    title: "Reload this document",
  },

  "show-time-travel": {
    group: "show-frames",
    pos: 3,
    action: "time_travel",
    icon: "history",
    label: "TimeTravel",
    title: "Show complete editing history of this document",
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
    action: "find",
    label: "Find",
    icon: "search",
    keyboard: "control + f",
  },
  replace: {
    group: "find",
    pos: 0,
    action: "replace",
    label: "Replace",
    icon: "replace",
    disabled: ({ read_only }) => read_only,
  },
  "goto-line": {
    group: "find",
    pos: 3,
    action: "goto_line",
    label: "Goto Line",
    icon: "bolt",
    keyboard: "control + l",
  },
  "auto-indent": {
    group: "format",
    action: "auto_indent",
    label: "Auto Indent",
    title: "Automatically indent selected code",
    disabled: ({ read_only }) => read_only,
    icon: "indent",
  },

  format: {
    group: "format",
    action: "format",
    label: "Format",
    title: "Syntactically format the document.",
    icon: FORMAT_SOURCE_ICON,
  },

  build: {
    group: "build",
    action: "build",
    label: "Build",
    title:
      "Build the document.  To disable automatic builds, change Account → Editor → 'Build on save'.",
    icon: "play-circle",
  },

  "force-build": {
    group: "build",
    action: "force_build",
    label: "Force Build",
    title: "Force rebuild entire project.",
    icon: "play",
  },

  clean: {
    group: "build",
    action: "clean",
    label: "Delete Aux Files",
    title: "Delete all temporary files left around from builds",
    icon: "trash",
  },

  rescan_latex_directive: {
    group: "scan",
    action: "rescan_latex_directive",
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
    action: "sync",
    label: "Synchronize Views",
    keyboard: `${IS_MACOS ? "⌘" : "alt"} + enter`,
    title: "Synchronize the latex source view with the PDF output",
    icon: "sync",
    onClick: ({ props }) => {
      props.actions.sync?.(props.id, props.editor_actions);
    },
  },
} as const;

export const GROUPS: { [group: string]: string[] } = {};
for (const name in MENUS) {
  for (const group of MENUS[name].groups) {
    if (GROUPS[group] != null) {
      throw Error(
        "groups must be unique but '${group}' of '${key}' is duplicated",
      );
    } else {
      GROUPS[group] = [];
    }
  }
}

for (const name in COMMANDS) {
  const command = COMMANDS[name];
  const { group } = command;
  if (group != null) {
    const v = GROUPS[group];
    if (v == null) {
      throw Error(`command ${name} in unknown group '${group}'`);
    }
    v.push(name);
  }
}
