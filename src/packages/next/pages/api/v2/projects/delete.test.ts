/** @jest-environment node */

import { createMocks } from "lib/api/test-framework";
import handler from "./delete";

// Mock the dependencies
jest.mock("@cocalc/server/projects/delete", () => jest.fn());
jest.mock("lib/account/get-account", () => jest.fn());

describe("/api/v2/projects/delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("unauthenticated request should return JSON error, not throw", async () => {
    // Mock getAccountId to return undefined (not authenticated)
    const getAccountId = require("lib/account/get-account");
    getAccountId.mockResolvedValue(undefined);

    const { req, res } = createMocks({
      method: "POST",
      url: "/api/v2/projects/delete",
      body: {
        project_id: "00000000-0000-0000-0000-000000000000",
      },
    });

    // This should NOT throw - it should handle the error gracefully
    await expect(handler(req, res)).resolves.not.toThrow();

    // Should return JSON error response
    const data = res._getJSONData();
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("must be signed in");
  });

  test("authenticated request calls deleteProject", async () => {
    const mockAccountId = "11111111-1111-1111-1111-111111111111";
    const mockProjectId = "00000000-0000-0000-0000-000000000000";

    // Mock getAccountId to return a valid account_id
    const getAccountId = require("lib/account/get-account");
    getAccountId.mockResolvedValue(mockAccountId);

    // Mock deleteProject
    const deleteProject = require("@cocalc/server/projects/delete");
    deleteProject.mockResolvedValue(undefined);

    const { req, res } = createMocks({
      method: "POST",
      url: "/api/v2/projects/delete",
      body: {
        project_id: mockProjectId,
      },
    });

    await handler(req, res);

    // Should call deleteProject with correct params
    expect(deleteProject).toHaveBeenCalledWith({
      account_id: mockAccountId,
      project_id: mockProjectId,
    });

    // Should return OK status
    const data = res._getJSONData();
    expect(data).toHaveProperty("status");
    expect(data.status).toBe("ok");
  });
});
