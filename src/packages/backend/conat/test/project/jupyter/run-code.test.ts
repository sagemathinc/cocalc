/*

DEVELOPMENT:

pnpm test `pwd`/run-code.test.ts

*/

import { before, after, connect } from "@cocalc/backend/conat/test/setup";
import {
  jupyterClient,
  jupyterServer,
} from "@cocalc/conat/project/jupyter/run-code";
import { uuid } from "@cocalc/util/misc";

beforeAll(before);

describe("create very simple mocked jupyter runner and test evaluating code", () => {
  let client1, client2;
  it("create two clients", async () => {
    client1 = connect();
    client2 = connect();
  });

  let server;
  const project_id = uuid();
  it("create jupyter code run server", () => {
    // running code with this just results in two responses: the path and the cells
    async function jupyterRun({ path, cells }) {
      async function* runner() {
        yield [{ path }];
        yield [{ cells }];
      }
      return runner();
    }

    server = jupyterServer({ client: client1, project_id, jupyterRun });
  });

  let client;
  const path = "a.ipynb";
  const cells = [{ id: "a", input: "2+3" }];
  it("create a jupyter client, then run some code", async () => {
    client = jupyterClient({ path, project_id, client: client2 });
    const iter = await client.run(cells);
    const v: any[] = [];
    for await (const output of iter) {
      v.push(output);
    }
    expect(v).toEqual([[{ path }], [{ cells }]]);
  });

  const count = 100;
  it(`run ${count} evaluations to ensure that the speed is reasonable (and also everything is kept properly ordered, etc.)`, async () => {
    const start = Date.now();
    for (let i = 0; i < count; i++) {
      const v: any[] = [];
      const cells = [{ id: `${i}`, input: `${i} + ${i}` }];
      for await (const output of await client.run(cells)) {
        v.push(output);
      }
      expect(v).toEqual([[{ path }], [{ cells }]]);
    }
    const evalsPerSecond = Math.floor((1000 * count) / (Date.now() - start));
    if (process.env.BENCH) {
      console.log({ evalsPerSecond });
    }
    expect(evalsPerSecond).toBeGreaterThan(25);
  });

  it("cleans up", () => {
    server.close();
    client.close();
  });
});

describe("create  simple mocked jupyter runner that does actually eval an expression", () => {
  let client1, client2;
  it("create two clients", async () => {
    client1 = connect();
    client2 = connect();
  });

  let server;
  const project_id = uuid();
  it("create jupyter code run server", () => {
    // running code with this just results in two responses: the path and the cells
    async function jupyterRun({ cells }) {
      async function* runner() {
        for (const { id, input } of cells) {
          yield [{ id, output: eval(input) }];
        }
      }
      return runner();
    }

    server = jupyterServer({ client: client1, project_id, jupyterRun });
  });

  let client;
  const path = "b.ipynb";
  const cells = [
    { id: "a", input: "2+3" },
    { id: "b", input: "3**5" },
  ];
  it("create a jupyter client, then run some code", async () => {
    client = jupyterClient({ path, project_id, client: client2 });
    const iter = await client.run(cells);
    const v: any[] = [];
    for await (const output of iter) {
      v.push(output);
    }
    expect(v).toEqual([[{ id: "a", output: 5 }], [{ id: "b", output: 243 }]]);
  });

  it("cleans up", () => {
    server.close();
    client.close();
  });
});

afterAll(after);
