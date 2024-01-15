export interface Command {
  title: JSX.Element | string;
  icon: string;
  label: JSX.Element | string;
  // one of action or onClick must be specified
  action?: string;
  onClick?: ({ props }) => void;
  disable?: string;
}

export const COMMANDS: { [command: string]: Command } = {
  "split-row": {
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
  "show-table-of-contents": {
    action: "show_table_of_contents",
    title: "Show the Table of Contents",
    icon: "align-right",
    label: "Table of Contents",
  },
  "show-guide": {
    action: "guide",
    title: "Show guidebook",
    onClick: ({ props }) => {
      props.actions.guide(props.id, props.type);
    },
    label: "Guide",
    icon: "magic",
  },
  "show-search": {
    action: "show_search",
    title: "Show panel for searching in this document",
    label: "Search",
    icon: "search",
  },
  "show-overview": {
    action: "show_overview",
    title: "Show overview of all pages",
    label: "Overview",
    icon: "overview",
  },
  "show-pages": {
    action: "show_pages",
    title: "Show all pages of this document",
    label: "Pages",
    icon: "pic-centered",
  },
  "show-slideshow": {
    action: "show_slideshow",
    title: "Display Slideshow Presentation",
    label: "Slideshow",
    icon: "play-square",
  },
  "show-speaker-notes": {
    action: "show_speaker_notes",
    title: "Show Speaker Notes",
    label: "Speaker Notes",
    icon: "pencil",
  },
  "show-shell": {
    action: "shell",
    title: "Open a terminal for running code",
    icon: "terminal",
    disable: "disableTerminals",
    label: "Shell",
  },
  "show-terminal": {
    action: "terminal",
    title: "Open a command line terminal for interacting with the Linux prompt",
    icon: "terminal",
    disable: "disableTerminals",
    label: "Terminal",
  },
};
