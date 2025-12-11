import { defineMessage } from "react-intl";

export const SEARCH_COMMANDS = "search_commands";
export const APPLICATION_MENU = "__title__";

// Predefined zoom percentages for consistent zoom options across the application
export const ZOOM_PERCENTAGES = [50, 85, 100, 115, 125, 150, 200, 400] as const;

// Export zoom-related messages for use in other components
export const ZOOM_MESSAGES = {
  zoomPageWidth: {
    title: defineMessage({
      id: "command.generic.zoom_page_width.title",
      defaultMessage: "Zoom to page width",
    }),
    label: defineMessage({
      id: "command.generic.zoom_page_width.label",
      defaultMessage: "Zoom to Width",
    }),
  },
  zoomPageHeight: {
    title: defineMessage({
      id: "command.generic.zoom_page_height.title",
      defaultMessage: "Zoom to page height",
    }),
    label: defineMessage({
      id: "command.generic.zoom_page_height.label",
      defaultMessage: "Zoom to Height",
    }),
  },
};

// Build on save icon constants - exported for consistent iconography across components
export const BUILD_ON_SAVE_ICON_ENABLED = "delivered-procedure-outlined";
export const BUILD_ON_SAVE_ICON_DISABLED = "stop-filled";
export const BUILD_ON_SAVE_LABEL = defineMessage({
  id: "command.generic.build_on_save.label",
  defaultMessage:
    "Build on Save {enabled, select, true {(Enabled)} other {(Disabled)}}",
});
