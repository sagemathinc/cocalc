import getPort, { getPorts } from "./get-port";

describe("test getting a random available port", () => {
  it("tests it", async () => {
    const port = await getPort();
    expect(port).toBeGreaterThan(1024);
  });
});

describe("test getPorts -- getting many ports at once in parallel", () => {
  const count = 5000;
  it(`get ${count} ports at once, thus testing it isn't too slow and also nice to see no conflicts`, async () => {
    const start = Date.now();
    const w = await getPorts(count);
    expect(new Set(w).size).toBe(count);
    // takes ~200ms to get 5000 of them on my laptop:
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
