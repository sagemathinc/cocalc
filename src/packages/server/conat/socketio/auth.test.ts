/*

pnpm test `pwd`/auth.test.ts

*/

import { isAllowed } from "./auth";
import { inboxPrefix } from "@cocalc/conat/names";

// Mock the module where isCollaborator is exported from
jest.mock("@cocalc/server/projects/is-collaborator", () => ({
  __esModule: true,
  default: jest.fn(),
}));

import isCollaborator from "@cocalc/server/projects/is-collaborator";

const PUBSUB: ("pub" | "sub")[] = ["pub", "sub"];

const project_id = "00000000-0000-4000-8000-000000000000";
const project_id2 = "00000000-0000-4000-8000-000000000001";

const account_id = "00000000-0000-4000-8000-000000000010";
const account_id2 = "00000000-0000-4000-8000-000000000011";

describe("test isAllowed for non-authenticated", () => {
  it("non-authenticated users can't do anything we try", async () => {
    for (const subject of ["*", "public", "global", ">", "hub", "test"]) {
      for (const type of PUBSUB) {
        expect(await isAllowed({ user: null, type, subject })).toBe(false);
      }
    }
  });
});

describe("test isAllowed for hub", () => {
  it("hub user can do anything we try", async () => {
    for (const subject of ["*", "public", "global", ">", "hub", "test"]) {
      for (const type of PUBSUB) {
        expect(
          await isAllowed({ user: { hub_id: "hub" }, type, subject }),
        ).toBe(true);
      }
    }
  });
});

describe("test isAllowed for common subjects for projects and accounts", () => {
  it("project user can't do random things", async () => {
    for (const subject of ["*", "public", "global", ">", "hub", "test"]) {
      for (const type of PUBSUB) {
        expect(await isAllowed({ user: { project_id }, type, subject })).toBe(
          false,
        );
      }
    }
  });

  it("project can publish to hub.project.project_id. but not subscribe", async () => {
    // `hub.${userType}.${userId}.`
    expect(
      await isAllowed({
        user: { project_id },
        type: "pub",
        subject: `hub.project.${project_id}.x`,
      }),
    ).toBe(true);
    expect(
      await isAllowed({
        user: { project_id },
        type: "sub",
        subject: `hub.project.${project_id}.>`,
      }),
    ).toBe(false);
  });

  it("account can publish to hub.account.account_id. but not subscribe", async () => {
    // `hub.${userType}.${userId}.`
    expect(
      await isAllowed({
        user: { account_id },
        type: "pub",
        subject: `hub.account.${account_id}.x`,
      }),
    ).toBe(true);
    expect(
      await isAllowed({
        user: { account_id },
        type: "sub",
        subject: `hub.account.${account_id}.>`,
      }),
    ).toBe(false);
  });

  it("account and project can publish to anything starting with _INBOX.", async () => {
    expect(
      await isAllowed({
        user: { account_id },
        type: "pub",
        subject: `_INBOX.x`,
      }),
    ).toBe(true);
    expect(
      await isAllowed({
        user: { project_id },
        type: "pub",
        subject: `_INBOX.x`,
      }),
    ).toBe(true);
  });

  it("account and project are allowed to subscribe to their custom inbox but not other inboxes", async () => {
    expect(
      await isAllowed({
        user: { account_id },
        type: "sub",
        subject: inboxPrefix({ account_id }),
      }),
    ).toBe(true);

    expect(
      await isAllowed({
        user: { project_id },
        type: "sub",
        subject: inboxPrefix({ project_id }),
      }),
    ).toBe(true);

    expect(
      await isAllowed({
        user: { project_id },
        type: "sub",
        subject: inboxPrefix({ project_id: project_id2 }),
      }),
    ).toBe(false);

    expect(
      await isAllowed({
        user: { account_id },
        type: "sub",
        subject: inboxPrefix({ account_id: account_id2 }),
      }),
    ).toBe(false);

    // collab or not, account can't listen to inbox for a project:
    (isCollaborator as jest.Mock).mockResolvedValue(false);
    expect(
      await isAllowed({
        user: { account_id },
        type: "sub",
        subject: inboxPrefix({ project_id }),
      }),
    ).toBe(false);

    (isCollaborator as jest.Mock).mockResolvedValue(true);
    expect(
      await isAllowed({
        user: { account_id },
        type: "sub",
        subject: inboxPrefix({ project_id }),
      }),
    ).toBe(false);
  });

  it("account and project can also subscribe to public.", async () => {
    expect(
      await isAllowed({
        user: { account_id },
        type: "sub",
        subject: "public.>",
      }),
    ).toBe(true);

    expect(
      await isAllowed({
        user: { project_id },
        type: "sub",
        subject: "public.>",
      }),
    ).toBe(true);
  });

  it("account and project cannot publish to public.", async () => {
    expect(
      await isAllowed({
        user: { account_id },
        type: "pub",
        subject: "public.version",
      }),
    ).toBe(false);

    expect(
      await isAllowed({
        user: { project_id },
        type: "pub",
        subject: "public.version",
      }),
    ).toBe(false);
  });
});

// `project.${project_id}.` and `*.project-${project_id}.>`
describe("test isAllowed for subjects special to projects", () => {
  it("checks the special project subjects, which allow both pub and sub", async () => {
    for (const type of PUBSUB) {
      expect(
        await isAllowed({
          user: { project_id },
          type,
          subject: `project.${project_id}.`,
        }),
      ).toBe(true);
      expect(
        await isAllowed({
          user: { project_id },
          type,
          subject: `foo.project-${project_id}.bar`,
        }),
      ).toBe(true);
    }
  });
});

describe("test isAllowed for subjects special to accounts (similar to projects)", () => {
  it("checks the special project subjects, which allow both pub and sub", async () => {
    for (const type of PUBSUB) {
      expect(
        await isAllowed({
          user: { account_id },
          type,
          subject: `account.${account_id}.`,
        }),
      ).toBe(true);
      expect(
        await isAllowed({
          user: { account_id },
          type,
          subject: `foo.account-${account_id}.bar`,
        }),
      ).toBe(true);
    }
  });
});

describe("test isAllowed for collaboration -- this is the most nontrivial one", () => {
  it("verifies an account can access a project it collaborates on", async () => {
    // Arrange: isCollaborator resolves to true
    (isCollaborator as jest.Mock).mockResolvedValue(true);

    expect(
      await isAllowed({
        user: { account_id },
        subject: `project.${project_id}.foo`,
        type: "pub",
      }),
    ).toBe(true);

    expect(isCollaborator).toHaveBeenCalled();
  });

  it("same account and project -- even if not collaborator still have permissions because of LRU cache!", async () => {
    (isCollaborator as jest.Mock).mockResolvedValue(false);

    expect(
      await isAllowed({
        user: { account_id },
        subject: `project.${project_id}.foo`,
        type: "pub",
      }),
    ).toBe(true);
  });
  
  
  it("check on another project that not a collab on", async () => {
    (isCollaborator as jest.Mock).mockResolvedValue(false);

    expect(
      await isAllowed({
        user: { account_id },
        subject: `project.${project_id2}.foo`,
        type: "pub",
      }),
    ).toBe(false);
  });
});
