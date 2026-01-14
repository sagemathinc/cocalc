/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
## Project Ownership Transfer - Test Coverage

This test suite validates the ownership transfer and collaborator management rules.

### Scenario Matrix

| Actor Type   | Action                 | Target User        | Current State    | Allowed? | Validation Rule                   | Test Coverage |
| ------------ | ---------------------- | ------------------ | ---------------- | -------- | --------------------------------- | ------------- |
| Owner        | Elevate to owner       | Collaborator       | Has other owners | ✅ Yes   | Owner privilege                   | ✅ Tested     |
| Owner        | Demote to collaborator | Owner (self)       | Has other owners | ✅ Yes   | Can step down if not last owner   | ✅ Tested     |
| Owner        | Demote to collaborator | Owner (other)      | Has other owners | ✅ Yes   | Owner privilege                   | ✅ Tested     |
| Owner        | Demote to collaborator | Owner (any)        | Last owner       | ❌ No    | Must maintain ≥1 owner            | ✅ Tested     |
| Owner        | Add collaborator       | N/A                | Any              | ✅ Yes   | Current functionality             | ✅ Tested     |
| Owner        | Remove collaborator    | Collaborator       | Any              | ✅ Yes   | Current functionality             | ✅ Tested     |
| Owner        | Remove collaborator    | Owner (self)       | Any              | ❌ No    | Must demote to collaborator first | ✅ Tested     |
| Owner        | Remove collaborator    | Owner (other)      | Any              | ❌ No    | Must demote to collaborator first | ✅ Tested     |
| Collaborator | Elevate to owner       | Self               | Any              | ❌ No    | No self-elevation                 | ✅ Tested     |
| Collaborator | Elevate to owner       | Other collaborator | Any              | ❌ No    | No user type changes              | ✅ Tested     |
| Collaborator | Elevate to owner       | Owner              | Any              | ❌ No    | No user type changes              | ✅ Tested     |
| Collaborator | Demote to collaborator | Owner              | Any              | ❌ No    | Cannot change owner status        | ✅ Tested     |
| Collaborator | Add collaborator       | N/A                | Setting disabled | ✅ Yes   | Current behavior                  | ✅ Tested     |
| Collaborator | Add collaborator       | N/A                | Setting enabled  | ❌ No    | New constraint                    | ✅ Tested     |
| Collaborator | Remove collaborator    | Other collaborator | Setting disabled | ✅ Yes   | Current behavior                  | ✅ Tested     |
| Collaborator | Remove collaborator    | Other collaborator | Setting enabled  | ❌ No    | New constraint                    | ✅ Tested     |
| Collaborator | Remove collaborator    | Self               | Any              | ✅ Yes   | Can always leave                  | ✅ Tested     |
| Collaborator | Remove collaborator    | Owner              | Any              | ❌ No    | Cannot remove owners              | ✅ Tested     |

### Core Validation Rules (All Tested)

1. **Minimum Owner Rule:** Projects must have at least 1 owner at all times
2. **Owner Privilege Rule:** Only owners can change user types (owner ↔ collaborator)
3. **Self-Step-Down Rule:** Owners can demote themselves only if other owners exist
4. **No Self-Elevation Rule:** Collaborators cannot elevate themselves or others
5. **Collaborator Management Rule:** When setting enabled, only owners can add/remove collaborators
6. **Self-Remove Rule:** Users can always remove themselves (except owners - must demote first)
7. **No Direct Owner Removal:** Owners cannot be removed directly. Must demote to collaborator first.

### Error Codes Tested

All error codes defined in `OwnershipErrorCode` enum (see project-ownership.ts):

- `LAST_OWNER` - Cannot demote the last owner
- `NOT_OWNER` - Only owners can perform this action
- `INVALID_TARGET` - Target user is invalid or not in project
- `INVALID_USER` - User not found in project
- `CANNOT_REMOVE_OWNER` - Cannot remove owners directly
- `INVALID_REQUESTING_USER` - Requesting user is not a valid member
- `INVALID_PROJECT_STATE` - Project data is missing or invalid
*/

import {
  canManageCollaborators,
  countOwners,
  isLastOwner,
  isUserGroup,
  OwnershipErrorCode,
  validateAddCollaborator,
  validateRemoveCollaborator,
  validateUserTypeChange,
} from "./project-ownership";

describe("isUserGroup", () => {
  test("returns true for owner", () => {
    expect(isUserGroup("owner")).toBe(true);
  });

  test("returns true for collaborator", () => {
    expect(isUserGroup("collaborator")).toBe(true);
  });

  test("returns false for invalid values", () => {
    expect(isUserGroup("admin")).toBe(false);
    expect(isUserGroup("public")).toBe(false);
    expect(isUserGroup(undefined)).toBe(false);
    expect(isUserGroup(null)).toBe(false);
    expect(isUserGroup("")).toBe(false);
  });
});

describe("countOwners", () => {
  test("counts owners correctly", () => {
    const users = {
      user1: { group: "owner" },
      user2: { group: "collaborator" },
      user3: { group: "owner" },
    };
    expect(countOwners(users)).toBe(2);
  });

  test("returns 0 for no owners", () => {
    const users = {
      user1: { group: "collaborator" },
      user2: { group: "collaborator" },
    };
    expect(countOwners(users)).toBe(0);
  });

  test("handles null users", () => {
    expect(countOwners(null)).toBe(0);
  });

  test("handles undefined users", () => {
    expect(countOwners(undefined)).toBe(0);
  });

  test("handles empty object", () => {
    expect(countOwners({})).toBe(0);
  });
});

describe("isLastOwner", () => {
  test("returns true when user is the only owner", () => {
    const users = {
      user1: { group: "owner" },
      user2: { group: "collaborator" },
    };
    expect(isLastOwner("user1", users)).toBe(true);
  });

  test("returns false when there are multiple owners", () => {
    const users = {
      user1: { group: "owner" },
      user2: { group: "owner" },
      user3: { group: "collaborator" },
    };
    expect(isLastOwner("user1", users)).toBe(false);
  });

  test("returns false when user is not an owner", () => {
    const users = {
      user1: { group: "owner" },
      user2: { group: "collaborator" },
    };
    expect(isLastOwner("user2", users)).toBe(false);
  });

  test("returns false for null users", () => {
    expect(isLastOwner("user1", null)).toBe(false);
  });

  test("returns false for undefined users", () => {
    expect(isLastOwner("user1", undefined)).toBe(false);
  });
});

describe("validateUserTypeChange", () => {
  const mockUsers = {
    owner1: { group: "owner" },
    owner2: { group: "owner" },
    collab1: { group: "collaborator" },
    collab2: { group: "collaborator" },
  };

  test("owner can promote collaborator to owner", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "collab1",
      target_current_group: "collaborator",
      target_new_group: "owner",
      all_users: mockUsers,
    });
    expect(result.valid).toBe(true);
  });

  test("owner can demote another owner when multiple owners exist", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "owner2",
      target_current_group: "owner",
      target_new_group: "collaborator",
      all_users: mockUsers,
    });
    expect(result.valid).toBe(true);
  });

  test("owner changing collaborator to same group is allowed (no-op)", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "collab1",
      target_current_group: "collaborator",
      target_new_group: "collaborator",
      all_users: mockUsers,
    });
    expect(result.valid).toBe(true);
  });

  test("owner can demote self when other owners exist", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "owner1",
      target_current_group: "owner",
      target_new_group: "collaborator",
      all_users: mockUsers,
    });
    expect(result.valid).toBe(true);
  });

  test("cannot demote last owner", () => {
    const usersWithOneOwner = {
      owner1: { group: "owner" },
      collab1: { group: "collaborator" },
    };
    const result = validateUserTypeChange({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "owner1",
      target_current_group: "owner",
      target_new_group: "collaborator",
      all_users: usersWithOneOwner,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.LAST_OWNER);
  });

  test("collaborator cannot promote self", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "collab1",
      requesting_user_group: "collaborator",
      target_account_id: "collab1",
      target_current_group: "collaborator",
      target_new_group: "owner",
      all_users: mockUsers,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.NOT_OWNER);
  });

  test("collaborator cannot promote others", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "collab1",
      requesting_user_group: "collaborator",
      target_account_id: "collab2",
      target_current_group: "collaborator",
      target_new_group: "owner",
      all_users: mockUsers,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.NOT_OWNER);
  });

  test("collaborator cannot demote owners", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "collab1",
      requesting_user_group: "collaborator",
      target_account_id: "owner1",
      target_current_group: "owner",
      target_new_group: "collaborator",
      all_users: mockUsers,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.NOT_OWNER);
  });

  test("fails when target user not in project", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "nonexistent",
      target_current_group: "collaborator",
      target_new_group: "owner",
      all_users: mockUsers,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.INVALID_USER);
  });

  test("fails when requesting user is invalid", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "someone",
      requesting_user_group: undefined,
      target_account_id: "collab1",
      target_current_group: "collaborator",
      target_new_group: "owner",
      all_users: mockUsers,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.INVALID_REQUESTING_USER);
  });

  test("fails when target has invalid group", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "collab1",
      target_current_group: undefined,
      target_new_group: "owner",
      all_users: mockUsers,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.INVALID_TARGET);
  });

  test("fails when new group is invalid", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "collab1",
      target_current_group: "collaborator",
      target_new_group: "admin" as any,
      all_users: mockUsers,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.INVALID_TARGET);
  });

  test("fails when all_users is null", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "collab1",
      target_current_group: "collaborator",
      target_new_group: "owner",
      all_users: null,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.INVALID_PROJECT_STATE);
  });

  test("fails when all_users is undefined", () => {
    const result = validateUserTypeChange({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "collab1",
      target_current_group: "collaborator",
      target_new_group: "owner",
      all_users: undefined,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.INVALID_PROJECT_STATE);
  });
});

describe("canManageCollaborators", () => {
  test("owner can manage when setting disabled", () => {
    const result = canManageCollaborators({
      user_group: "owner",
      manage_users_owner_only: false,
    });
    expect(result).toBe(true);
  });

  test("collaborator can manage when setting disabled", () => {
    const result = canManageCollaborators({
      user_group: "collaborator",
      manage_users_owner_only: false,
    });
    expect(result).toBe(true);
  });

  test("owner can manage when setting enabled", () => {
    const result = canManageCollaborators({
      user_group: "owner",
      manage_users_owner_only: true,
    });
    expect(result).toBe(true);
  });

  test("collaborator cannot manage when setting enabled", () => {
    const result = canManageCollaborators({
      user_group: "collaborator",
      manage_users_owner_only: true,
    });
    expect(result).toBe(false);
  });

  test("invalid user cannot manage", () => {
    const result = canManageCollaborators({
      user_group: undefined,
      manage_users_owner_only: false,
    });
    expect(result).toBe(false);
  });

  test("invalid user cannot manage when setting enabled", () => {
    const result = canManageCollaborators({
      user_group: undefined,
      manage_users_owner_only: true,
    });
    expect(result).toBe(false);
  });
});

describe("validateRemoveCollaborator", () => {
  test("owner can remove collaborator", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "collab1",
      target_user_group: "collaborator",
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(true);
  });

  test("owner can remove collaborator when setting enabled", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "collab1",
      target_user_group: "collaborator",
      manage_users_owner_only: true,
    });
    expect(result.valid).toBe(true);
  });

  test("collaborator can remove another collaborator when setting disabled", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "collab1",
      requesting_user_group: "collaborator",
      target_account_id: "collab2",
      target_user_group: "collaborator",
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(true);
  });

  test("collaborator can remove self when setting enabled", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "collab1",
      requesting_user_group: "collaborator",
      target_account_id: "collab1",
      target_user_group: "collaborator",
      manage_users_owner_only: true,
    });
    expect(result.valid).toBe(true);
  });

  test("collaborator can remove self when setting disabled", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "collab1",
      requesting_user_group: "collaborator",
      target_account_id: "collab1",
      target_user_group: "collaborator",
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(true);
  });

  test("collaborator cannot remove another collaborator when setting enabled", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "collab1",
      requesting_user_group: "collaborator",
      target_account_id: "collab2",
      target_user_group: "collaborator",
      manage_users_owner_only: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.NOT_OWNER);
  });

  test("cannot remove owner directly", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "owner2",
      target_user_group: "owner",
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.CANNOT_REMOVE_OWNER);
  });

  test("owner cannot remove self (must demote first)", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "owner1",
      target_user_group: "owner",
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.CANNOT_REMOVE_OWNER);
  });

  test("collaborator cannot remove owner", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "collab1",
      requesting_user_group: "collaborator",
      target_account_id: "owner1",
      target_user_group: "owner",
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.CANNOT_REMOVE_OWNER);
  });

  test("fails when requesting user is invalid", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "someone",
      requesting_user_group: undefined,
      target_account_id: "collab1",
      target_user_group: "collaborator",
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.INVALID_REQUESTING_USER);
  });

  test("fails when target user not in project (undefined group)", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "nonexistent",
      target_user_group: undefined,
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.INVALID_TARGET);
  });

  test("fails when target has invalid group", () => {
    const result = validateRemoveCollaborator({
      requesting_account_id: "owner1",
      requesting_user_group: "owner",
      target_account_id: "someone",
      target_user_group: "admin" as any,
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.INVALID_TARGET);
  });
});

describe("validateAddCollaborator", () => {
  test("owner can add when setting disabled", () => {
    const result = validateAddCollaborator({
      user_group: "owner",
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(true);
  });

  test("collaborator can add when setting disabled", () => {
    const result = validateAddCollaborator({
      user_group: "collaborator",
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(true);
  });

  test("owner can add when setting enabled", () => {
    const result = validateAddCollaborator({
      user_group: "owner",
      manage_users_owner_only: true,
    });
    expect(result.valid).toBe(true);
  });

  test("collaborator cannot add when setting enabled", () => {
    const result = validateAddCollaborator({
      user_group: "collaborator",
      manage_users_owner_only: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.NOT_OWNER);
  });

  test("fails when user is invalid", () => {
    const result = validateAddCollaborator({
      user_group: undefined,
      manage_users_owner_only: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(OwnershipErrorCode.INVALID_REQUESTING_USER);
  });
});
