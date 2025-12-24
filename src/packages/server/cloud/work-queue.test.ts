import {
  enqueueCloudVmWork,
  claimCloudVmWork,
  markCloudVmWorkDone,
  markCloudVmWorkFailed,
} from "@cocalc/server/cloud";
import { before, after, getPool } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);

afterAll(after);

beforeEach(async () => {
  await getPool().query("DELETE FROM cloud_vm_work");
});

describe("cloud vm work queue", () => {
  it("enqueues and claims work with SKIP LOCKED semantics", async () => {
    const id1 = await enqueueCloudVmWork({
      vm_id: "vm-1",
      action: "start",
      payload: { foo: 1 },
    });
    const id2 = await enqueueCloudVmWork({
      vm_id: "vm-2",
      action: "stop",
      payload: { foo: 2 },
    });

    const batch1 = await claimCloudVmWork({
      worker_id: "worker-a",
      limit: 1,
    });
    expect(batch1).toHaveLength(1);
    expect(batch1[0].id).toBe(id1);

    const batch2 = await claimCloudVmWork({
      worker_id: "worker-b",
      limit: 1,
    });
    expect(batch2).toHaveLength(1);
    expect(batch2[0].id).toBe(id2);

    const { rows } = await getPool().query(
      "SELECT id, state, locked_by FROM cloud_vm_work ORDER BY created_at",
    );
    expect(rows).toEqual([
      { id: id1, state: "in_progress", locked_by: "worker-a" },
      { id: id2, state: "in_progress", locked_by: "worker-b" },
    ]);
  });

  it("marks work done and failed", async () => {
    const id1 = await enqueueCloudVmWork({
      vm_id: "vm-1",
      action: "create",
    });
    const id2 = await enqueueCloudVmWork({
      vm_id: "vm-2",
      action: "delete",
    });

    await claimCloudVmWork({ worker_id: "worker-a", limit: 2 });
    await markCloudVmWorkDone(id1);
    await markCloudVmWorkFailed(id2, "boom");

    const { rows } = await getPool().query(
      "SELECT id, state, error FROM cloud_vm_work ORDER BY created_at",
    );
    expect(rows).toEqual([
      { id: id1, state: "done", error: null },
      { id: id2, state: "failed", error: "boom" },
    ]);
  });
});
