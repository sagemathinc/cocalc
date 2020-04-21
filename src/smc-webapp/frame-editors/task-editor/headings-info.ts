export const HEADINGS = ["Custom Order", "Due", "Changed"];
export const HEADINGS_DIR = ["asc", "desc"];

export const SORT_INFO = {
  "Custom Order": {
    key: "position",
    reverse: false,
  },
  Due: {
    key: "due_date",
    reverse: false,
  },
  Changed: {
    key: "last_edited",
    reverse: true,
  },
};

export function is_sortable(sort_column: string): boolean {
  return sort_column == HEADINGS[0];
}
