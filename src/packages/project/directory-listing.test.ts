import { get_listing } from "./directory-listing";

test("it gets a directory listing", async () => {
  const listing = await get_listing(".");
  // we just check that each entry has name, mtime and size properties.
  // it's getting $HOME so there's not much more we can do in general.
  for (const entry of listing) {
    // check properties
    expect(entry).toHaveProperty("name");
    expect(entry).toHaveProperty("mtime");
    expect(entry).toHaveProperty("size");

    // check something about types
    expect(typeof entry.name).toBe('string');
    expect(typeof entry.mtime).toBe('number');
    expect(typeof entry.size).toBe('number');
  }
});
