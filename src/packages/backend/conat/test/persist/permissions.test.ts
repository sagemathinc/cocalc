/*

pnpm test ./permissions.test.ts 

*/
import {
  assertHasWritePermission,
  SUBJECT,
} from "@cocalc/conat/persist/server";

const uuid = "00000000-0000-4000-8000-000000000000";
const uuid2 = "00000000-0000-4000-8000-000000000002";

describe("test subject permissions directly by calling assertHasWritePermission", () => {
  it("checks a bunch of things that should work don't throw", () => {
    // these don't throw
    assertHasWritePermission({
      subject: `${SUBJECT}.hub.api`,
      path: "hub/foo",
    });

    assertHasWritePermission({
      subject: `${SUBJECT}.hub.api`,
      path: "hub/foo/blah xxx~!/xxxx",
    });

    assertHasWritePermission({
      subject: `${SUBJECT}.project-${uuid}.api`,
      path: `projects/${uuid}/a.txt`,
    });

    assertHasWritePermission({
      subject: `${SUBJECT}.account-${uuid}.api`,
      path: `accounts/${uuid}/c/d.txt`,
    });
  });

  it("now check many things that are NOT allowed", () => {
    const BAD = [
      { subject: `${SUBJECT}.fubar.api`, path: "hub/foo/bar" },
      { subject: `fluber.hub.api`, path: "hub/foo" },
      {
        subject: `${SUBJECT}.projects-${uuid}.api`,
        path: `projects/${uuid}/foo`,
      },
      {
        subject: `${SUBJECT}.accounts-${uuid}.api`,
        path: `accounts/${uuid}/foo`,
      },
      {
        subject: `${SUBJECT}.project-${uuid}.api`,
        path: `accounts/${uuid}/foo`,
      },
      {
        subject: `${SUBJECT}.account-${uuid}.api`,
        path: `projects/${uuid}/foo`,
      },
      {
        subject: `${SUBJECT}.account-${uuid}.api`,
        path: `accounts/${uuid2}/foo`,
      },
      {
        subject: `${SUBJECT}.project-${uuid}.api`,
        path: `projects/${uuid2}/foo`,
      },
      {
        subject: `${SUBJECT}.project-${uuid}.api`,
        path: `projects/${uuid}/`,
      },
      {
        subject: `${SUBJECT}.project-${uuid}.api`,
        path: `projects/${uuid}`,
      },
      {
        subject: `${SUBJECT}.project-${uuid}.api`,
        path: `projects/${uuid}/foo/`,
      },
      {
        subject: `${SUBJECT}.project-${uuid}.api`,
        path: `projects/${uuid}/${"a".repeat(100000)}`,
      },
      {
        subject: `${SUBJECT}.project-${uuid}x.api`,
        path: `projects/${uuid}x/a.txt`,
      },
    ];

    for (const { subject, path } of BAD) {
      expect(() => assertHasWritePermission({ subject, path })).toThrow();
    }
  });
});
