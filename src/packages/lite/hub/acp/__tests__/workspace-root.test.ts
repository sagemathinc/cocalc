import { resolveWorkspaceRoot } from "../workspace-root";

describe("resolveWorkspaceRoot", () => {
  const originalEnv = process.env.COCALC_ACP_EXECUTOR;

  afterEach(() => {
    process.env.COCALC_ACP_EXECUTOR = originalEnv;
  });

  describe("container executor opt-in", () => {
    beforeEach(() => {
      process.env.COCALC_ACP_EXECUTOR = "container";
    });

    it("builds container workspace with project id and relative dir", () => {
      const root = resolveWorkspaceRoot(
        { workingDirectory: "sub" } as any,
        "proj-123",
      );
      expect(root).toBe("/root/sub");
    });

    it("respects absolute container working dir", () => {
      const root = resolveWorkspaceRoot(
        { workingDirectory: "/root/custom" } as any,
        "proj-123",
      );
      expect(root).toBe("/root/custom");
    });

    it("falls back to project root when unset", () => {
      const root = resolveWorkspaceRoot(undefined, "proj-123");
      expect(root).toBe("/root");
    });
  });

  describe("local/lite default", () => {
    beforeEach(() => {
      delete process.env.COCALC_ACP_EXECUTOR;
    });

    it("resolves local relative paths from cwd", () => {
      const root = resolveWorkspaceRoot({ workingDirectory: "tmp" } as any);
      expect(root.endsWith("/tmp")).toBe(true);
    });

    it("returns cwd when nothing specified", () => {
      const root = resolveWorkspaceRoot(undefined, undefined);
      expect(root).toBe(process.cwd());
    });
  });
});
