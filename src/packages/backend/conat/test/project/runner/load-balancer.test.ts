/*

DEVELOPMENT:

pnpm test `pwd`/load-balancer.test.ts

*/

import { before, after, connect } from "@cocalc/backend/conat/test/setup";
import {
  server as projectRunnerServer,
  client as projectRunnerClient,
} from "@cocalc/conat/project/runner/run";
import {
  server as lbServer,
  client as lbClient,
} from "@cocalc/conat/project/runner/load-balancer";
import { uuid } from "@cocalc/util/misc";

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
      status: async ({ project_id }) => {
        return running.has(project_id)
          ? { state: "running" }
          : { state: "opened" };
      },
      localPath: async ({ project_id }) => `/tmp/${project_id}`,
      move: async () => {},
      save: async () => {},
    });
  });

  it("make a client and test the server", async () => {
    const project_id = uuid();
    const runClient = projectRunnerClient({
      subject: "project-runner.0",
      client: client2,
    });
    await runClient.start({ project_id });
    expect(await runClient.status({ project_id })).toEqual({
      server: "0",
      state: "running",
    });
    expect(await runClient.status({ project_id: uuid() })).toEqual({
      server: "0",
      state: "opened",
    });
    await runClient.stop({ project_id });
    expect(await runClient.status({ project_id })).toEqual({
      server: "0",
      state: "opened",
    });
  });

  it("make a load balancer", async () => {
    await lbServer({ client: client1 });
  });

  it("make a client for the load balancer, and test the runner via the load balancer", async () => {
    const project_id = uuid();
    const lbc = lbClient({
      subject: `project.${project_id}.run`,
      client: client2,
    });
    await lbc.start();
    expect(await lbc.status()).toEqual({
      server: "0",
      state: "running",
    });

    const lbc2 = lbClient({
      subject: `project.${uuid()}.run`,
      client: client2,
    });
    expect(await lbc2.status()).toEqual({
      server: "0",
      state: "opened",
    });

    await lbc.stop();
    expect(await lbc.status()).toEqual({
      server: "0",
      state: "opened",
    });
  });
});

afterAll(after);
