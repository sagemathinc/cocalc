import cdcmd from "./chdir-commands";

describe("chdir-commands", () => {
  test("bash", () => {
    expect(cdcmd("bash", "/home/")).toBe("cd '/home/'");
    expect(cdcmd("bash", "/home/foo'bar")).toBe("cd '/home/foo\\'bar'");
  });

  test("python", () => {
    expect(cdcmd("python", "/home/")).toBe("import os; os.chdir('/home/')");
    expect(cdcmd("python", "/home/foo'bar")).toBe(
      "import os; os.chdir('/home/foo\\'bar')"
    );
  });
});
