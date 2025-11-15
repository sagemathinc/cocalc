import { act, renderHook, waitFor } from "@testing-library/react";
import { fsClient } from "@cocalc/conat/files/fs";
import { before, after } from "@cocalc/backend/conat/test/setup";
import { uuid } from "@cocalc/util/misc";
import {
  createPathFileserver,
  cleanupFileservers,
} from "@cocalc/backend/conat/files/test/util";
import useListing, {
  type SortField,
  type SortDirection,
} from "@cocalc/frontend/project/listing/use-listing";
import { type FilesystemClient } from "@cocalc/conat/files/fs";

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
      fs2: FilesystemClient | undefined = undefined;
    const { result, rerender } = renderHook(() =>
      useListing({ fs: fs2, path, throttleUpdate: 0 }),
    );
    expect(result.current).toEqual({
      listing: null,
      error: null,
      refresh: expect.any(Function),
    });
    fs2 = fs;
    rerender();

    // now that fs2 is set, eventually it will be initialized to not be null
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
      listing: [
        { name: "hello.txt", size: 5, mtime: expect.any(Number), type: "f" },
      ],
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
            type: "f",
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

describe("test sorting many files with useListing", () => {
  const project_id = uuid();
  let fs, server;
  it("creates fileserver service and fs client", async () => {
    server = await createPathFileserver();
    fs = fsClient({ subject: `${server.service}.project-${project_id}` });
  });

  it("create some files", async () => {
    await fs.writeFile("a.txt", "abc");
    await fs.writeFile("b.txt", "b");
    await fs.writeFile("huge.txt", "b".repeat(1000));

    // make b.txt old
    await fs.utimes(
      "b.txt",
      (Date.now() - 60_000) / 1000,
      (Date.now() - 60_000) / 1000,
    );
  });

  it("test useListing with many files and sorting", async () => {
    let path = "",
      sortField: SortField = "name",
      sortDirection: SortDirection = "asc";
    const { result, rerender } = renderHook(() =>
      useListing({ fs, path, throttleUpdate: 0, sortField, sortDirection }),
    );

    await waitFor(() => {
      expect(result.current.listing?.length).toEqual(3);
    });
    expect(result.current.listing?.map(({ name }) => name)).toEqual([
      "a.txt",
      "b.txt",
      "huge.txt",
    ]);

    sortDirection = "desc";
    sortField = "name";
    rerender();
    await waitFor(() => {
      expect(result.current.listing?.map(({ name }) => name)).toEqual([
        "huge.txt",
        "b.txt",
        "a.txt",
      ]);
    });

    sortDirection = "asc";
    sortField = "mtime";
    rerender();
    await waitFor(() => {
      expect(result.current.listing?.map(({ name }) => name)).toEqual([
        "b.txt",
        "a.txt",
        "huge.txt",
      ]);
    });

    sortDirection = "desc";
    sortField = "mtime";
    rerender();
    await waitFor(() => {
      expect(result.current.listing?.map(({ name }) => name)).toEqual([
        "huge.txt",
        "a.txt",
        "b.txt",
      ]);
    });

    sortDirection = "asc";
    sortField = "size";
    rerender();
    await waitFor(() => {
      expect(result.current.listing?.map(({ name }) => name)).toEqual([
        "b.txt",
        "a.txt",
        "huge.txt",
      ]);
    });

    sortDirection = "desc";
    sortField = "size";
    rerender();
    await waitFor(() => {
      expect(result.current.listing?.map(({ name }) => name)).toEqual([
        "huge.txt",
        "a.txt",
        "b.txt",
      ]);
    });
  });
});

afterAll(async () => {
  await after();
  await cleanupFileservers();
});
