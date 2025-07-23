import { act, renderHook, waitFor } from "@testing-library/react";
import { fsClient } from "@cocalc/conat/files/fs";
import { before, after } from "@cocalc/backend/conat/test/setup";
import { uuid } from "@cocalc/util/misc";
import {
  createPathFileserver,
  cleanupFileservers,
} from "@cocalc/backend/conat/files/test/util";
import useListing from "@cocalc/frontend/project/listing/use-listing";

beforeAll(before);

describe("the useListing hook", () => {
  const project_id = uuid();
  let fs, server;
  it("creates fileserver service and fs client", async () => {
    server = await createPathFileserver();
    fs = fsClient({ subject: `${server.service}.project-${project_id}` });
  });

  it("test useListing and file creation", async () => {
    let path = "",
      fs2 = fs;
    const { result, rerender } = renderHook(() =>
      useListing({ fs: fs2, path, throttleUpdate: 0 }),
    );

    expect(result.current).toEqual({
      listing: null,
      error: null,
      refresh: expect.any(Function),
    });

    // eventually it will be initialized to not be null
    await waitFor(() => {
      expect(result.current.listing).not.toBeNull();
    });

    expect(result.current).toEqual({
      listing: [],
      error: null,
      refresh: expect.any(Function),
    });

    // now create a file
    await act(async () => {
      await fs.writeFile("hello.txt", "world");
    });

    await waitFor(() => {
      expect(result.current.listing?.length).toEqual(1);
    });

    expect(result.current).toEqual({
      listing: [{ name: "hello.txt", size: 5, mtime: expect.any(Number) }],
      error: null,
      refresh: expect.any(Function),
    });

    // change the path to one that does not exist and rerender,
    // resulting in an ENOENT error
    path = "scratch";
    rerender();
    await waitFor(() => {
      expect(result.current.listing).toBeNull();
      expect(result.current.error?.code).toBe("ENOENT");
    });

    await act(async () => {
      // create the path, a file in there, refresh and it works
      await fs.mkdir(path);
      await fs.writeFile("scratch/b.txt", "hi");
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        listing: [
          {
            name: "b.txt",
            size: 2,
            mtime: expect.any(Number),
          },
        ],
        error: null,
        refresh: expect.any(Function),
      });
    });

    // change fs and see the hook update
    const project_id2 = uuid();
    fs2 = fsClient({
      subject: `${server.service}.project-${project_id2}`,
    });
    path = "";
    rerender();
    await waitFor(() => {
      expect(result.current).toEqual({
        listing: [],
        error: null,
        refresh: expect.any(Function),
      });
    });
  });
});

afterAll(async () => {
  await after();
  await cleanupFileservers();
});
