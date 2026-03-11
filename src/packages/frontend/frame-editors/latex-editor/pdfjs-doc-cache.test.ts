/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

jest.mock("@cocalc/cdn", () => ({
  versions: { "pdfjs-dist": "test" },
}));

jest.mock("@cocalc/frontend/customize/app-base-path", () => ({
  appBasePath: "/",
}));

jest.mock("@cocalc/frontend/frame-editors/frame-tree/util", () => ({
  raw_url: (...parts: string[]) => parts.join("/"),
}));

jest.mock("@cocalc/frontend/frame-editors/generic/client", () => ({
  getComputeServerId: () => 0,
}));

jest.mock("pdfjs-dist/webpack.mjs", () => ({}));

const pdfjsGetDocument = jest.fn();

jest.mock("pdfjs-dist", () => ({
  getDocument: (...args: any[]) => pdfjsGetDocument(...args),
}));

import { forgetDocument, getDocument } from "./pdfjs-doc-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("pdfjs-doc-cache", () => {
  beforeEach(() => {
    pdfjsGetDocument.mockReset();
  });

  test("deduplicates concurrent loads for the same URL", async () => {
    const url = "test://pdf/concurrent";
    const task = deferred<any>();
    const loadingTask = {
      destroy: jest.fn().mockResolvedValue(undefined),
      promise: task.promise,
    };
    const doc = { numPages: 3 };

    pdfjsGetDocument.mockReturnValue(loadingTask);

    const p1 = getDocument(url);
    const p2 = getDocument(url);
    task.resolve(doc);

    await expect(Promise.all([p1, p2])).resolves.toStrictEqual([doc, doc]);
    expect(pdfjsGetDocument).toHaveBeenCalledTimes(1);

    forgetDocument(url);
  });

  test("forgetDocument drops an in-flight load so a retry starts fresh", async () => {
    const url = "test://pdf/retry";
    const firstTask = deferred<any>();
    const secondTask = deferred<any>();
    const firstLoadingTask = {
      destroy: jest.fn().mockImplementation(async () => {
        firstTask.reject(new Error("destroyed"));
      }),
      promise: firstTask.promise,
    };
    const secondLoadingTask = {
      destroy: jest.fn().mockResolvedValue(undefined),
      promise: secondTask.promise,
    };
    const freshDoc = { numPages: 5 };

    pdfjsGetDocument
      .mockReturnValueOnce(firstLoadingTask)
      .mockReturnValueOnce(secondLoadingTask);

    const stale = getDocument(url).catch((err) => err);
    forgetDocument(url);
    secondTask.resolve(freshDoc);

    await expect(getDocument(url)).resolves.toBe(freshDoc);
    await expect(stale).resolves.toBeInstanceOf(Error);
    expect(firstLoadingTask.destroy).toHaveBeenCalledTimes(1);
    expect(pdfjsGetDocument).toHaveBeenCalledTimes(2);

    forgetDocument(url);
  });
});
