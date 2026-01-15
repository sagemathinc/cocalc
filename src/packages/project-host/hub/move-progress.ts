import { lroProgress } from "@cocalc/conat/lro/progress";

type Phase =
  | "preparing"
  | "sending"
  | "receiving"
  | "finalizing"
  | "done"
  | "failing";

type SnapshotEvent = {
  name: string;
  index: number;
  total: number;
  bytes?: number;
  parent?: string;
};

/**
 * Lightweight progress publisher for project moves.
 * Emits LRO progress events when an op_id is provided.
 */
export class MoveProgress {
  private project_id: string;
  private total: number;
  private completed = 0;
  private mode: string;
  private op_id?: string;

  constructor({
    project_id,
    totalSnapshots,
    mode,
    op_id,
  }: {
    project_id: string;
    totalSnapshots: number;
    mode: string;
    op_id?: string;
  }) {
    this.project_id = project_id;
    this.total = Math.max(1, totalSnapshots);
    this.mode = mode;
    this.op_id = op_id;
  }

  private progressPercent() {
    return Math.round((this.completed / this.total) * 100);
  }

  setTotal(totalSnapshots: number) {
    this.total = Math.max(1, totalSnapshots);
  }

  async snapshotProgress(evt: SnapshotEvent) {
    if (!this.op_id) return;
    const mb =
      evt.bytes != null ? Math.round(evt.bytes / 1_000_000) : undefined;
    await lroProgress({
      project_id: this.project_id,
      op_id: this.op_id,
      phase: "move",
      progress: this.progressPercent(),
      message: `[sending] ${evt.index + 1}/${evt.total} ${evt.name} MB=${mb}`,
    }).catch(() => {});
  }

  async phase(phase: Phase, desc?: string) {
    if (!this.op_id) return;
    await lroProgress({
      project_id: this.project_id,
      op_id: this.op_id,
      phase: "move",
      progress: phase === "done" ? 100 : this.progressPercent(),
      message: `[${phase}]${desc ? " " + desc : ""} (mode=${this.mode})`,
    }).catch(() => {});
  }

  async snapshotStarted(evt: SnapshotEvent) {
    if (!this.op_id) return;
    await lroProgress({
      project_id: this.project_id,
      op_id: this.op_id,
      phase: "move",
      progress: this.progressPercent(),
      message: `[sending] snapshot ${evt.index + 1}/${
        evt.total
      }: ${evt.name} (parent=${evt.parent ?? "none"})`,
    }).catch(() => {});
  }

  async snapshotFinished(evt: SnapshotEvent) {
    this.completed += 1;
    if (!this.op_id) return;
    await lroProgress({
      project_id: this.project_id,
      op_id: this.op_id,
      phase: "move",
      progress: this.progressPercent(),
      message: `[sending] sent snapshot ${evt.index + 1}/${
        evt.total
      }: ${evt.name} (parent=${evt.parent ?? "none"}, bytes=${
        evt.bytes ?? "?"
      })`,
    }).catch(() => {});
  }

  async done() {
    await this.phase("done", "move complete");
  }

  async fail(err: any) {
    if (!this.op_id) return;
    await lroProgress({
      project_id: this.project_id,
      op_id: this.op_id,
      phase: "move",
      progress: this.progressPercent(),
      message: "[failing] move failed",
      error: `${err}`,
    }).catch(() => {});
  }
}
