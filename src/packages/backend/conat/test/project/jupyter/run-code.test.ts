/*

DEVELOPMENT:

pnpm test `pwd`/run-code.test.ts

*/

import {
  before,
  after,
  connect,
  delay,
  wait,
} from "@cocalc/backend/conat/test/setup";
import {
  jupyterClient,
  jupyterServer,
} from "@cocalc/conat/project/jupyter/run-code";
import { uuid } from "@cocalc/util/misc";

// it's really 100+, but tests fails if less than this.
const MIN_EVALS_PER_SECOND = 10;

beforeAll(before);

async function getKernelStatus(_opts: { path: string }) {
  return { backend_state: "off" as "off", kernel_state: "idle" as "idle" };
}

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
    async function run({ path, cells }) {
      async function* runner() {
        yield { path, id: "0" };
        yield { cells, id: "0" };
      }
      return runner();
    }

    server = jupyterServer({
      client: client1,
      project_id,
      run,
      getKernelStatus,
    });
  });

  let client;
  const path = "a.ipynb";
  const cells = [{ id: "a", input: "2+3" }];
  it("create a jupyter client, then run some code", async () => {
    client = jupyterClient({ path, project_id, client: client2 });
    const iter = await client.run(cells);
    const v: any[] = [];
    for await (const output of iter) {
      v.push(...output);
    }
    expect(v).toEqual([
      { path, id: "0" },
      { cells, id: "0" },
    ]);
  });

  it("start iterating over the output after waiting", async () => {
    // this is the same as the previous test, except we insert a
    // delay from when we create the iterator, and when we start
    // reading values out of it.  This is important to test, because
    // it was broken in my first implementation, and is a common mistake
    // when implementing async iterators.
    client.verbose = true;
    const iter = await client.run(cells);
    const v: any[] = [];
    await delay(500);
    for await (const output of iter) {
      v.push(...output);
    }
    expect(v).toEqual([
      { path, id: "0" },
      { cells, id: "0" },
    ]);
  });

  const count = 100;
  it(`run ${count} evaluations to ensure that the speed is reasonable (and also everything is kept properly ordered, etc.)`, async () => {
    const start = Date.now();
    for (let i = 0; i < count; i++) {
      const v: any[] = [];
      const cells = [{ id: `${i}`, input: `${i} + ${i}` }];
      for await (const output of await client.run(cells)) {
        v.push(...output);
      }
      expect(v).toEqual([
        { path, id: "0" },
        { cells, id: "0" },
      ]);
    }
    const evalsPerSecond = Math.floor((1000 * count) / (Date.now() - start));
    if (process.env.BENCH) {
      console.log({ evalsPerSecond });
    }
    expect(evalsPerSecond).toBeGreaterThan(MIN_EVALS_PER_SECOND);
  });

  it("cleans up", () => {
    server.close();
    client.close();
  });
});

describe("create simple mocked jupyter runner that does actually eval an expression", () => {
  let client1, client2;
  it("create two clients", async () => {
    client1 = connect();
    client2 = connect();
  });

  let server;
  const project_id = uuid();
  const compute_server_id = 3;
  it("create jupyter code run server", () => {
    // running code with this just results in two responses: the path and the cells
    async function run({ cells }) {
      async function* runner() {
        for (const { id, input } of cells) {
          yield { id, output: eval(input) };
        }
      }
      return runner();
    }

    server = jupyterServer({
      client: client1,
      project_id,
      run,
      compute_server_id,
      getKernelStatus,
    });
  });

  let client;
  const path = "b.ipynb";
  const cells = [
    { id: "a", input: "2+3" },
    { id: "b", input: "3**5" },
  ];
  it("create a jupyter client, then run some code", async () => {
    client = jupyterClient({
      path,
      project_id,
      client: client2,
      compute_server_id,
    });
    const iter = await client.run(cells);
    const v: any[] = [];
    for await (const output of iter) {
      v.push(...output);
    }
    expect(v).toEqual([
      { id: "a", output: 5 },
      { id: "b", output: 243 },
    ]);
  });

  it("run code that FAILS and see error is visible to client properly", async () => {
    const iter = await client.run([
      { id: "a", input: "2+3" },
      { id: "b", input: "2+invalid" },
    ]);
    try {
      for await (const _ of iter) {
      }
    } catch (err) {
      expect(`${err}`).toContain("ReferenceError: invalid is not defined");
    }
  });

  it("cleans up", () => {
    server.close();
    client.close();
  });
});

describe("create mocked jupyter runner that does failover to backend output management when client disconnects", () => {
  let client1, client2;
  it("create two clients", async () => {
    client1 = connect();
    client2 = connect();
  });

  const path = "b.ipynb";
  const cells = [
    { id: "a", input: "10*(2+3)" },
    { id: "b", input: "100" },
  ];
  let server;
  const project_id = uuid();
  let handler: any = null;

  it("create jupyter code run server that also takes as long as the output to run", () => {
    async function run({ cells }) {
      async function* runner() {
        for (const { id, input } of cells) {
          const output = eval(input);
          await delay(output);
          yield { id, output };
        }
      }
      return runner();
    }

    class OutputHandler {
      messages: any[] = [];

      constructor(public cells) {}

      process = (mesg: any) => {
        this.messages.push(mesg);
      };
      done = () => {
        this.messages.push({ done: true });
      };
    }

    function outputHandler({ path: path0, cells }) {
      if (path0 != path) {
        throw Error(`path must be ${path}`);
      }
      handler = new OutputHandler(cells);
      return handler;
    }

    server = jupyterServer({
      client: client1,
      project_id,
      run,
      outputHandler,
      getKernelStatus,
    });
  });

  let client;
  it("create a jupyter client, then run some code (doesn't use output handler)", async () => {
    client = jupyterClient({
      path,
      project_id,
      client: client2,
    });
    const iter = await client.run(cells);
    const v: any[] = [];
    for await (const output of iter) {
      v.push(output);
    }
    expect(v).toEqual([[{ id: "a", output: 50 }], [{ id: "b", output: 100 }]]);
  });

  it("starts code running then closes the client, which causes output to have to be placed in the handler instead.", async () => {
    await client.run(cells);
    client.close();
    await wait({
      until: () => {
        return handler.messages.length >= 3;
      },
    });
    expect(handler.messages).toEqual([
      { id: "a", output: 50 },
      { id: "b", output: 100 },
      { done: true },
    ]);
  });

  it("cleans up", () => {
    server.close();
    client.close();
  });
});

afterAll(after);
