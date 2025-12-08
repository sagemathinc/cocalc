import { bootlog, resetBootlog } from "@cocalc/conat/project/runner/bootlog";

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
 * Emits bootlog events with type="move" so the frontend can render a live log.
 */
export class MoveProgress {
  private project_id: string;
  private total: number;
  private completed = 0;
  private mode: string;

  constructor({
    project_id,
    totalSnapshots,
    mode,
  }: {
    project_id: string;
    totalSnapshots: number;
    mode: string;
  }) {
    this.project_id = project_id;
    this.total = Math.max(1, totalSnapshots);
    this.mode = mode;
    // fresh log for each move
    resetBootlog({ project_id, compute_server_id: 0 }).catch(() => {});
  }

  private progressPercent() {
    return Math.round((this.completed / this.total) * 100);
  }

  setTotal(totalSnapshots: number) {
    this.total = Math.max(1, totalSnapshots);
  }

  async phase(phase: Phase, desc?: string) {
    await bootlog({
      project_id: this.project_id,
      compute_server_id: 0,
      type: "move",
      progress: phase === "done" ? 100 : this.progressPercent(),
      desc: `[${phase}]${desc ? " " + desc : ""} (mode=${this.mode})`,
    }).catch(() => {});
  }

  async snapshotStarted(evt: SnapshotEvent) {
    await bootlog({
      project_id: this.project_id,
      compute_server_id: 0,
      type: "move",
      progress: this.progressPercent(),
      desc: `[sending] snapshot ${evt.index + 1}/${
        evt.total
      }: ${evt.name} (parent=${evt.parent ?? "none"})`,
    }).catch(() => {});
  }

  async snapshotFinished(evt: SnapshotEvent) {
    this.completed += 1;
    await bootlog({
      project_id: this.project_id,
      compute_server_id: 0,
      type: "move",
      progress: this.progressPercent(),
      desc: `[sending] sent snapshot ${evt.index + 1}/${
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
    await bootlog({
      project_id: this.project_id,
      compute_server_id: 0,
      type: "move",
      progress: this.progressPercent(),
      desc: "[failing] move failed",
      error: `${err}`,
    }).catch(() => {});
  }
}
