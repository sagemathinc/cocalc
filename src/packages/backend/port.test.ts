test("that the port is set to the PORT env var", () => {
  process.env.PORT = "6000";
  expect(require("./port").default).toBe(6000);
});

export {};
