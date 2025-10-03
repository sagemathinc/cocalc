/*

DEVELOPMENT:


pnpm test `pwd`/load-balancer-2.test.ts


*/

import { before, after, connect } from "@cocalc/backend/conat/test/setup";
import { server as projectRunnerServer } from "@cocalc/conat/project/runner/run";
import {
  server as lbServer,
  client as lbClient,
} from "@cocalc/conat/project/runner/load-balancer";
import { uuid } from "@cocalc/util/misc";

beforeAll(before);

describe("create runner and load balancer with getConfig function", () => {
  let client1, client2;
  it("create two clients", () => {
    client1 = connect();
    client2 = connect();
  });

  const running: { [project_id: string]: any } = {};
  const projectState: { [project_id: string]: any } = {};

  it("create project runner server and load balancer with getConfig and setState functions", async () => {
    await projectRunnerServer({
      id: "0",
      client: client1,
      start: async ({ project_id, config }) => {
        running[project_id] = { ...config };
      },
      stop: async ({ project_id }) => {
        if (project_id) {
          delete running[project_id];
        } else {
          Object.keys(running).forEach(
            (project_id) => delete running[project_id],
          );
        }
      },
      status: async ({ project_id }) => {
        return running[project_id] != null
          ? { state: "running" }
          : { state: "opened" };
      },
      localPath: async ({ project_id }) => `/tmp/${project_id}`,
      move: async () => {},
      save: async () => {},
    });
    await lbServer({
      client: client1,
      getConfig: async ({ project_id }) => {
        return { name: project_id };
      },
      setState: async ({ project_id, state }) => {
        projectState[project_id] = state;
      },
    });
  });

  it("make a client for the load balancer, and test the runner via the load balancer", async () => {
    const project_id = uuid();
    const lbc = lbClient({
      subject: `project.${project_id}.run`,
      client: client2,
    });
    await lbc.start();

    expect(projectState).toEqual({ [project_id]: "running" });
    expect(running[project_id]).toEqual({ name: project_id });

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
