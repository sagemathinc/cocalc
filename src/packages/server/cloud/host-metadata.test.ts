import { logCloudVmEvent } from "@cocalc/server/cloud";
import { upsertProjectHost } from "@cocalc/database/postgres/project-hosts";
import { before, after, getPool } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);

afterAll(after);

beforeEach(async () => {
  await getPool().query("DELETE FROM cloud_vm_log");
  await getPool().query("DELETE FROM project_hosts");
});

describe("project host metadata updates", () => {
  it("preserves metadata when upserting without metadata fields", async () => {
    await upsertProjectHost({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Host One",
      region: "us-west1",
      metadata: { owner: "acct-1", size: "small" },
    });

    await upsertProjectHost({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Host One",
      region: "us-west1",
      status: "active",
    });

    const { rows } = await getPool().query(
      "SELECT metadata FROM project_hosts WHERE id='11111111-1111-1111-1111-111111111111'",
    );
    expect(rows[0].metadata).toMatchObject({ owner: "acct-1", size: "small" });
  });

  it("logCloudVmEvent adds last_action fields without wiping metadata", async () => {
    await upsertProjectHost({
      id: "22222222-2222-2222-2222-222222222222",
      name: "Host Two",
      region: "us-west1",
      metadata: { owner: "acct-2", size: "medium", machine: { cloud: "gcp" } },
    });

    await logCloudVmEvent({
      vm_id: "22222222-2222-2222-2222-222222222222",
      action: "start",
      status: "success",
      provider: "gcp",
    });

    const { rows } = await getPool().query(
      "SELECT metadata FROM project_hosts WHERE id='22222222-2222-2222-2222-222222222222'",
    );
    expect(rows[0].metadata).toMatchObject({
      owner: "acct-2",
      size: "medium",
      machine: { cloud: "gcp" },
      last_action: "start",
      last_action_status: "success",
    });
    expect(typeof rows[0].metadata.last_action_at).toBe("string");
  });

  it("cloud_vm_log entries always have timestamps", async () => {
    await upsertProjectHost({
      id: "33333333-3333-3333-3333-333333333333",
      name: "Host Three",
      region: "us-west1",
      metadata: { owner: "acct-3" },
    });

    await logCloudVmEvent({
      vm_id: "33333333-3333-3333-3333-333333333333",
      action: "provision",
      status: "failure",
      provider: "gcp",
      error: "boom",
    });

    const { rows } = await getPool().query(
      "SELECT ts, error FROM cloud_vm_log WHERE vm_id='33333333-3333-3333-3333-333333333333'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ts).toBeTruthy();
    expect(rows[0].error).toBe("boom");
  });
});
