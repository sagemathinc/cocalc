/*

DEVELOPMENT:

pnpm test `pwd`/run-code.test.ts

*/

import { before, after, connect } from "@cocalc/backend/conat/test/setup";
import {
  projectRunnerServer,
  projectRunnerClient,
} from "@cocalc/conat/project/runner/run";
import { uuid } from "@cocalc/util/misc";

beforeAll(before);

describe("create basic mocked project runner service and test", () => {
  let client1, client2;
  it("create two clients", () => {
    client1 = connect();
    client2 = connect();
  });

  const subject = "project-server";

  it("create project runner server", async () => {
    const running = new Set<string>();
    await projectRunnerServer({
      subject,
      client: client1,
      start: async ({ project_id }) => {
        running.add(project_id);
      },
      stop: async ({ project_id }) => {
        running.delete(project_id);
      },
      status: async ({ project_id }) =>
        running.has(project_id) ? { state: "running" } : { state: "stopped" },
    });
  });

  let runClient;
  it("make a client and test the server", async () => {
    const project_id = uuid();
    runClient = projectRunnerClient({ subject, client: client2 });
    await runClient.start({ project_id });
    expect(await runClient.status({ project_id })).toEqual({
      state: "running",
    });
    expect(await runClient.status({ project_id: uuid() })).toEqual({
      state: "stopped",
    });
    await runClient.stop({ project_id });
    expect(await runClient.status({ project_id })).toEqual({
      state: "stopped",
    });
  });
});

afterAll(after);
