import SyncClient from "@cocalc/sync-client";

export function foo() : any {
  const c = new SyncClient();
  const s = c.sync_client.sync_db({
    project_id: "97ce5a7c-25c1-4059-8670-c7de96a0db92",
    path: "b.tasks",
    primary_keys: ["task_id"],
    string_cols: ["desc"],
  });
  return s;
}
