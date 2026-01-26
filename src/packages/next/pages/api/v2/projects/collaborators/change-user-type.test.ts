/** @jest-environment node */

import { createMocks } from "lib/api/test-framework";
import handler from "./change-user-type";

jest.mock("@cocalc/server/projects/collaborators", () => ({
  changeUserType: jest.fn(),
}));
jest.mock("lib/account/get-account", () => jest.fn());

describe("/api/v2/projects/collaborators/change-user-type", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("unauthenticated request returns error", async () => {
    const getAccountId = require("lib/account/get-account");
    getAccountId.mockResolvedValue(undefined);

    const { req, res } = createMocks({
      method: "POST",
      url: "/api/v2/projects/collaborators/change-user-type",
      body: {
        project_id: "00000000-0000-0000-0000-000000000000",
        target_account_id: "11111111-1111-1111-1111-111111111111",
        new_group: "owner",
      },
    });

    await expect(handler(req, res)).resolves.not.toThrow();

    const collaborators = require("@cocalc/server/projects/collaborators");
    expect(collaborators.changeUserType).not.toHaveBeenCalled();

    const data = res._getJSONData();
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("signed in");
  });

  test("authenticated request calls changeUserType", async () => {
    const mockAccountId = "22222222-2222-2222-2222-222222222222";
    const mockProjectId = "00000000-0000-0000-0000-000000000000";
    const mockTargetAccountId = "11111111-1111-1111-1111-111111111111";

    const getAccountId = require("lib/account/get-account");
    getAccountId.mockResolvedValue(mockAccountId);

    const collaborators = require("@cocalc/server/projects/collaborators");
    collaborators.changeUserType.mockResolvedValue(undefined);

    const { req, res } = createMocks({
      method: "POST",
      url: "/api/v2/projects/collaborators/change-user-type",
      body: {
        project_id: mockProjectId,
        target_account_id: mockTargetAccountId,
        new_group: "collaborator",
      },
    });

    await handler(req, res);

    expect(collaborators.changeUserType).toHaveBeenCalledWith({
      account_id: mockAccountId,
      opts: {
        project_id: mockProjectId,
        target_account_id: mockTargetAccountId,
        new_group: "collaborator",
      },
    });

    const data = res._getJSONData();
    expect(data).toHaveProperty("status");
    expect(data.status).toBe("ok");
  });
});
