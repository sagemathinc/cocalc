import { menu } from "@cocalc/frontend/i18n";
import { APPLICATION_MENU } from "./const";
import { addMenus } from "./menus";

addMenus({
  app: {
    label: APPLICATION_MENU,
    pos: -10,
    groups: ["about", "frame_types", "quit", "settings"],
  },
  file: {
    label: menu.file,
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
    label: menu.edit,
    pos: 1,
    groups: ["undo-redo", "find", "copy", "ai", "format", "config"],
  },
  insert: {
    label: menu.insert,
    pos: 1.3,
    groups: [],
  },
  format: {
    label: menu.format,
    pos: 1.5,
    groups: ["code-format"],
  },
  view: {
    label: menu.view,
    pos: 2,
    groups: [
      "zoom",
      "scroll",
      "fold",
      "frame-control",
      "show-frames",
      "button-bar",
    ],
  },
  go: {
    label: menu.go,
    pos: 3,
    groups: ["action", "build", "scan", "other-users", "get-info"],
  },
  help: {
    label: menu.help,
    pos: 100,
    groups: ["search-commands", "help-link", "tour"],
  },
});
