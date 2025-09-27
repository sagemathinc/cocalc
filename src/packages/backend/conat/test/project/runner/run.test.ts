/*

DEVELOPMENT:

pnpm test `pwd`/run-code.test.ts

*/

import { before, after, connect, wait } from "@cocalc/backend/conat/test/setup";
import {
  server as projectRunnerServer,
  client as projectRunnerClient,
} from "@cocalc/conat/project/runner/run";
import { uuid } from "@cocalc/util/misc";
import state from "@cocalc/conat/project/runner/state";

beforeAll(before);

describe("create basic mocked project runner service and test", () => {
  let client1, client2;
  it("create two clients", () => {
    client1 = connect();
    client2 = connect();
  });

  it("create project runner server", async () => {
    const running = new Set<string>();
    await projectRunnerServer({
      id: "0",
      client: client1,
      start: async ({ project_id }) => {
        running.add(project_id);
      },
      stop: async ({ project_id }) => {
        if (project_id) {
          running.delete(project_id);
        } else {
          running.clear();
        }
      },
      status: async ({ project_id }) =>
        running.has(project_id) ? { state: "running" } : { state: "opened" },
      localPath: async ({ project_id }) => `/tmp/${project_id}`,
    });
  });

  let project_id;
  it("make a client and test the server", async () => {
    project_id = uuid();
    const runClient = projectRunnerClient({
      subject: "project-runner.0",
      client: client2,
    });
    await runClient.start({ project_id });
    expect(await runClient.status({ project_id })).toEqual({
      state: "running",
      server: "0",
    });
    expect(await runClient.status({ project_id: uuid() })).toEqual({
      state: "opened",
      server: "0",
    });
    await runClient.stop({ project_id });
    expect(await runClient.status({ project_id })).toEqual({
      state: "opened",
      server: "0",
    });
  });

  it("get the status of the runner", async () => {
    const { projects, runners } = await state({ client: client2 });
    expect(runners.getAll()).toEqual({ "0": { time: runners.get("0")?.time } });
    await wait({ until: () => projects.get(project_id)?.state == "opened" });
    expect(projects.get(project_id)).toEqual({ state: "opened", server: "0" });
  });

  it("add another runner and observe it appears", async () => {
    const running = new Set<string>();
    await projectRunnerServer({
      id: "1",
      client: client1,
      start: async ({ project_id }) => {
        running.add(project_id);
      },
      stop: async ({ project_id }) => {
        if (project_id) {
          running.delete(project_id);
        } else {
          running.clear();
        }
      },
      status: async ({ project_id }) =>
        running.has(project_id) ? { state: "running" } : { state: "opened" },
      localPath: async ({ project_id }) => `/tmp/${project_id}`,
    });

    const { runners } = await state({ client: client2 });
    await wait({
      until: () => runners.get("1") != null,
    });
  });

  it("run a projects on server 1", async () => {
    const runClient = projectRunnerClient({
      subject: "project-runner.1",
      client: client2,
    });
    const project_id = uuid();
    const x = await runClient.start({ project_id });
    expect(x.server).toEqual("1");
  });
});

afterAll(after);
