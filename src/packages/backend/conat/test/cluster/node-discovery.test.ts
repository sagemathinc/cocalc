import {
  before,
  after,
  delay,
  wait,
  waitForConsistentState,
} from "@cocalc/backend/conat/test/setup";
import { createClusterNode } from "./util";
import { isEqual } from "lodash";

beforeAll(before);

jest.setTimeout(30000);
describe("test automatic node discovery (and forgetting)", () => {
  const nodes: { client; server }[] = [];
  const clusterName = "auto";
  const create = async (id) => {
    nodes.push(
      await createClusterNode({
        id,
        clusterName,
        autoscanInterval: 50,
        longAutoscanInterval: 6000,
        forgetClusterNodeInterval: 500, // make automatic forgetting short so we can test.
      }),
    );
  };

  it("create two servers with cluster support enabled", async () => {
    await create("node0");
    await create("node1");
  });

  it("connect 0 -> 1 and see other link get automatically added", async () => {
    expect(nodes[0].server.clusterAddresses(clusterName).length).toBe(1);
    await nodes[0].server.join(nodes[1].server.address());
    expect(nodes[0].server.clusterAddresses(clusterName).length).toBe(2);
    expect(nodes[1].server.clusterAddresses(clusterName).length).toBe(1);
    await wait({
      until: () => {
        return nodes[1].server.clusterAddresses(clusterName).length == 2;
      },
    });
  });

  it("make a new node and a connection 2 -> 1 and observe cluster gets completed automatically", async () => {
    await create("node2");
    await nodes[2].server.join(nodes[1].server.address());
    // node0 and node1 don't instantly know node2
    expect(nodes[0].server.clusterAddresses(clusterName).length).toBe(2);
    expect(nodes[1].server.clusterAddresses(clusterName).length).toBe(2);
    expect(nodes[2].server.clusterAddresses(clusterName).length).toBe(2);
    // but soon they will all know each other
    await wait({
      until: () => {
        return (
          nodes[0].server.clusterAddresses(clusterName).length == 3 &&
          nodes[1].server.clusterAddresses(clusterName).length == 3 &&
          nodes[2].server.clusterAddresses(clusterName).length == 3
        );
      },
    });
  });

  // WORRY -- with count bigger, e.g., 5, sometimes this doesn't work.
  // It might be an indicator of an issue.
  const count = 3;
  it(`check state is consistent -- before adding more ${count} nodes`, async () => {
    await waitForConsistentState(nodes.map((x) => x.server));
  });

  it(`add ${count} more nodes`, async () => {
    for (let i = 3; i < 3 + count; i++) {
      await create(`node${i}`);
      await nodes[i].server.join(nodes[i - 1].server.address());
    }
  });

  it("wait until every node knows about every other node", async () => {
    const total = nodes.length;
    const all = new Set(nodes.map((x) => x.server.address()));
    await wait({
      until: () => {
        for (let i = 0; i < total; i++) {
          if (
            !isEqual(
              all,
              new Set(nodes[i].server.clusterAddresses(clusterName)),
            )
          ) {
            return false;
          }
        }
        return true;
      },
    });
  });

  it(`wait for cluster to have consistent state -- after adding ${count} nodes`, async () => {
    await waitForConsistentState(nodes.map((x) => x.server));
  });

  it("close nodes[1], run scan, and observe that nodes[1] is forgotten", async () => {
    const numNodes = () => {
      return Object.keys(
        nodes[0].server.clusterLinks[nodes[0].server.clusterName],
      ).length;
    };
    const n = numNodes();
    nodes[1].server.close();
    expect(nodes[1].server.isHealthy()).toBe(false);
    // not instantly gone
    expect(numNodes()).toBe(n);
    await nodes[0].server.scan();
    // still not gone
    expect(numNodes()).toBe(n);
    // wait a second and scan, and it must be gone (because we set the interval very short)
    await delay(1000);
    await nodes[0].server.scan();
    expect(numNodes()).toBe(n - 1);
  });
});

afterAll(after);
