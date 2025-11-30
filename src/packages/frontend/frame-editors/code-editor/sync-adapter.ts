/*
Thin wrapper around SyncString to keep change wiring in one place.
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
