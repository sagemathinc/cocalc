export {};

test("we import the main program under nodejs", async () => {
  // This should work.  Ensures we're using nodejs code only.
  await import("@cocalc/project/project");
});
