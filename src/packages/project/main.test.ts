export {};

test("we import the main program under nodejs", async () => {
  // This should work.  If you accidentally import too much from @cocalc/frontend,
  // then that can break this import throwing an exception, e.g., something like
  // "... ReferenceError: navigator is not defined ..."
  await import("@cocalc/project/project");
});
