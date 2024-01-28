import { APPLICATION_MENU } from "./const";
import { addMenus } from "./menus";

addMenus({
  app: {
    label: APPLICATION_MENU,
    pos: -10,
    groups: ["about", "frame_types", "quit"],
  },
  file: {
    label: "File",
    pos: 0,
    groups: [
      "new-open",
      "reload",
      "save",
      "export",
      "misc-file-actions",
      "delete",
    ],
  },
  edit: {
    label: "Edit",
    pos: 1,
    groups: ["undo-redo", "find", "copy", "ai", "format", "config"],
  },
  insert: {
    label: "Insert",
    pos: 1.3,
    groups: [],
  },
  format: {
    label: "Format",
    pos: 1.5,
    groups: ['code-format'],
  },
  view: {
    label: "View",
    pos: 2,
    groups: ["zoom", "frame-control", "show-frames"],
  },
  go: {
    label: "Go",
    pos: 3,
    groups: ["action", "build", "scan", "other-users", "get-info"],
  },
  help: {
    label: "Help",
    pos: 100,
    groups: ["search-commands", "help-link", "tour"],
  },
});
