import { filename_extension, path_split } from "@cocalc/util/misc";

export type SyncDocDoctype = "syncstring" | "syncdb" | "immer";

export type SyncDocDescriptor =
  | { doctype: "syncstring" }
  | {
      doctype: "syncdb" | "immer";
      primary_keys: string[];
      string_cols: string[];
    };

const EXTENSION_DOCTYPES: Record<string, SyncDocDescriptor> = {
  tasks: {
    doctype: "syncdb",
    primary_keys: ["task_id"],
    string_cols: ["desc"],
  },
  board: {
    doctype: "syncdb",
    primary_keys: ["id"],
    string_cols: ["str"],
  },
  slides: {
    doctype: "syncdb",
    primary_keys: ["id"],
    string_cols: ["str"],
  },
  chat: {
    doctype: "immer",
    primary_keys: ["date", "sender_id", "event"],
    string_cols: ["input"],
  },
  "sage-chat": {
    doctype: "immer",
    primary_keys: ["date", "sender_id", "event"],
    string_cols: ["input"],
  },
  "cocalc-crm": {
    doctype: "syncdb",
    primary_keys: ["table", "id"],
    string_cols: [],
  },
};

const FILENAME_DOCTYPES: Record<string, SyncDocDescriptor> = {};

export function getSyncDocDescriptor(path: string): SyncDocDescriptor {
  const ext = filename_extension(path).toLowerCase();
  if (ext) {
    const fromExt = EXTENSION_DOCTYPES[ext];
    if (fromExt) return fromExt;
  }
  const tail = path_split(path).tail;
  if (tail) {
    const fromName = FILENAME_DOCTYPES[tail];
    if (fromName) return fromName;
    const lower = tail.toLowerCase();
    if (lower !== tail) {
      const fromLower = FILENAME_DOCTYPES[lower];
      if (fromLower) return fromLower;
    }
  }
  return { doctype: "syncstring" };
}
