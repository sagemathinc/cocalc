/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { delay } from "awaiting";

import { reuseInFlight } from "./reuse-in-flight";

const BASIC_DURATION_MS = 100;

describe("reuseInFlight", () => {
  test("no args", async () => {
    let counter = 0;

    async function incrementing() {
      await delay(BASIC_DURATION_MS);
      const result = counter;
      counter += 1;
      return result;
    }

    const reused = reuseInFlight(incrementing);

    // The idea is: call reused more than once while it is still sitting in the "delay"
    const res = await Promise.all([
      reused(),
      delay(BASIC_DURATION_MS * 0.3).then(() => reused()),
      delay(BASIC_DURATION_MS * 0.7).then(() => reused()),
      delay(BASIC_DURATION_MS * 1.1).then(() => reused()),
      delay(BASIC_DURATION_MS * 1.4).then(() => reused()),
      delay(BASIC_DURATION_MS * 2.2).then(() => reused()),
    ]);

    expect(res).toStrictEqual([0, 0, 0, 1, 1, 2]);
  });

  test("different args", async () => {
    let counter = [0, 0];

    async function incrementing(x: 0 | 1) {
      await delay(BASIC_DURATION_MS);
      const result = counter[x];
      counter[x] += 1;
      return result;
    }

    const reused = reuseInFlight(incrementing);

    // addiitonally to the above, we call reused with different args and expect more 0s
    const res = await Promise.all([
      reused(0),
      reused(1),
      delay(BASIC_DURATION_MS * 0.3).then(() => reused(0)),
      delay(BASIC_DURATION_MS * 0.3).then(() => reused(1)),
      delay(BASIC_DURATION_MS * 0.7).then(() => reused(0)),
      delay(BASIC_DURATION_MS * 1.1).then(() => reused(1)),
      delay(BASIC_DURATION_MS * 1.4).then(() => reused(1)),
      delay(BASIC_DURATION_MS * 2.2).then(() => reused(1)),
      delay(BASIC_DURATION_MS * 2.2).then(() => reused(0)),
    ]);

    expect(res).toStrictEqual([0, 0, 0, 0, 0, 1, 1, 2, 1]);
  });

  test("ignoreSingleUndefined", async () => {
    let counter = 0;

    async function incrementing() {
      await delay(BASIC_DURATION_MS);
      const result = counter;
      counter += 1;
      return result;
    }

    const valid = reuseInFlight(incrementing);
    const ignored = reuseInFlight(incrementing, {
      ignoreSingleUndefined: true,
    });

    const res1 = await Promise.all([
      valid(),
      delay(0.3 * BASIC_DURATION_MS).then(valid), // different, because [undefined] is not []
      delay(0.4 * BASIC_DURATION_MS).then(() => valid()),
    ]);

    const consoleWarnMock = jest.spyOn(console, "warn").mockImplementation();
    try {
      // but with ignoreSingleUndefined all 3 are the same, hence return 2
      const res2 = await Promise.all([
        ignored(),
        delay(0.3 * BASIC_DURATION_MS).then(ignored),
        delay(0.4 * BASIC_DURATION_MS).then(() => ignored()),
      ]);

      expect(consoleWarnMock).toHaveBeenCalledTimes(1);
      expect(consoleWarnMock).toHaveBeenCalledWith(
        "Ignoring single undefined arg (reuseInFlight)",
      );

      expect(res1).toStrictEqual([0, 1, 0]);
      expect(res2).toStrictEqual([2, 2, 2]);
    } finally {
      consoleWarnMock.mockRestore();
    }
  });

  test("good key", async () => {
    let sum = 0;

    async function incrementing(x: number) {
      await delay(BASIC_DURATION_MS);
      const result = sum;
      sum += x;
      return result;
    }

    const mockFn = jest.fn();

    // we create a "good key", the one from the implementation
    const reused = reuseInFlight(incrementing, {
      createKey: (x) => {
        const key = JSON.stringify(x);
        mockFn("key", key);
        return key;
      },
    });

    const res = await Promise.all([
      reused(1, 44),
      reused(1),
      delay(BASIC_DURATION_MS * 0.3).then(() => reused(1)),
      delay(BASIC_DURATION_MS * 0.3).then(() => reused(3)),
      delay(BASIC_DURATION_MS * 1.1).then(() => reused(1)),
      delay(BASIC_DURATION_MS * 1.1).then(() => reused(1)),
    ]);

    // as a reference, how two args are serialized
    expect(mockFn).toHaveBeenCalledTimes(6);
    expect(mockFn).toHaveBeenNthCalledWith(1, "key", "[1,44]");

    expect(res).toStrictEqual([0, 1, 1, 2, 5, 5]);
  });

  test("bad key", async () => {
    let sum = 0;

    async function incrementing(x: number) {
      await delay(BASIC_DURATION_MS);
      const result = sum;
      sum += x;
      return result;
    }

    // we create a "bad key"
    const reused = reuseInFlight(incrementing, {
      createKey: () => "foo",
    });

    const res = await Promise.all([
      reused(1, 44),
      delay(BASIC_DURATION_MS * 0.3).then(() => reused(1)),
      delay(BASIC_DURATION_MS * 0.3).then(() => reused(3)),
      delay(BASIC_DURATION_MS * 1.1).then(() => reused(1)),
      delay(BASIC_DURATION_MS * 1.1).then(() => reused(1)),
    ]);

    expect(res).toStrictEqual([0, 0, 0, 1, 1]);
  });
});
