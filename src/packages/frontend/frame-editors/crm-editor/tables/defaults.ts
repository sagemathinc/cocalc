/*
These defaults are automatically set for any table that has a writeable field with
the given name.

If you want to disable one of these for a specific table, explicitly set it to null
in its schema.
*/

export const createDefaults = {
  progress: 0,
  assignee: "[account_id]",
  created_by: "[account_id]",
  created: "now()",
  status: "new",
  priority: "normal",
};

export const updateDefaults = {
  last_modified_by: "[account_id]",
  last_edited: "now()",
};
