import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "events";
import { SyncFsService } from "./sync-fs-service";

describe("SyncFsService", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sync-fs-service-"));
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("emits a change event with a patch on external edit", async () => {
    const path = join(dir, "a.txt");
    writeFileSync(path, "hello");

    const svc = new SyncFsService();
    svc.heartbeat(path);
    await new Promise((r) => setTimeout(r, 300));

    // external edit
    writeFileSync(path, "hello world");

    const [evt] = (await once(svc, "event")) as any[];
    expect(evt.path).toBe(path);
    expect(evt.type).toBe("change");
    expect(evt.change?.patch).toBeDefined();
    svc.close();
  }, 10_000);

  it("stops watching when active=false", async () => {
    const path = join(dir, "c.txt");
    writeFileSync(path, "keep");

    const svc = new SyncFsService();
    svc.heartbeat(path);
    await new Promise((r) => setTimeout(r, 300));

    // drop interest
    svc.heartbeat(path, false);

    writeFileSync(path, "keep2");

    let eventReceived = false;
    svc.once("event", () => {
      eventReceived = true;
    });

    await new Promise((r) => setTimeout(r, 500));
    expect(eventReceived).toBe(false);
    svc.close();
  }, 10_000);

  it("emits delete when file removed", async () => {
    const path = join(dir, "b.txt");
    writeFileSync(path, "bye");

    const svc = new SyncFsService();
    svc.heartbeat(path);
    await new Promise((r) => setTimeout(r, 300));

    rmSync(path);

    const [evt] = (await once(svc, "event")) as any[];
    expect(evt.type).toBe("delete");
    svc.close();
  }, 10_000);
});
