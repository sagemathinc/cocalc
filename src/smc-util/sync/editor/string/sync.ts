

export let SyncString = class SyncString extends SyncDoc {
  constructor(opts) {
    opts = defaults(opts, {
      id: undefined,
      client: required,
      project_id: undefined,
      path: undefined,
      save_interval: undefined,
      patch_interval: undefined,
      file_use_interval: undefined,
      cursors: false, // if true, also provide cursor tracking ability
      before_change_hook: undefined,
      after_change_hook: undefined
    });

    const from_str = str => new StringDocument(str);

    super({
      string_id: opts.id,
      client: opts.client,
      project_id: opts.project_id,
      path: opts.path,
      save_interval: opts.save_interval,
      patch_interval: opts.patch_interval,
      file_use_interval: opts.file_use_interval,
      cursors: opts.cursors,
      from_str,
      doctype: { type: "string" },
      before_change_hook: opts.before_change_hook,
      after_change_hook: opts.after_change_hook
    });
  }
};
