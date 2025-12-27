/*
Thin wrapper around SyncString to keep change wiring in one place.
This is intentionally STRING-ONLY: it assumes remote changes can be merged by
calling SyncString.to_str() and 3-way merging the buffer. Do NOT use this for
syncdb/structured docs, since to_str() materializes the full document and can
blow up memory/CPU on every change event.
*/

import type { SyncString } from "@cocalc/sync/editor/string/sync";

interface SyncAdapterOpts {
  sync: SyncString;
  onRemoteChange: () => void;
}

export class SyncAdapter {
  private disposed = false;
  private changeHandler: () => void;

  constructor(private opts: SyncAdapterOpts) {
    this.changeHandler = () => {
      if (this.disposed) return;
      this.opts.onRemoteChange();
    };
    this.opts.sync.on("change", this.changeHandler);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.opts.sync.off("change", this.changeHandler);
  }
}
