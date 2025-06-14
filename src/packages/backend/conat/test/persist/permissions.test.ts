/*

pnpm test ./permissions.test.ts 

*/
import { SERVICE } from "@cocalc/conat/persist/util";
import { assertHasWritePermission } from "@cocalc/conat/persist/auth";

const uuid = "00000000-0000-4000-8000-000000000000";
const uuid2 = "00000000-0000-4000-8000-000000000002";

describe("test subject permissions directly by calling assertHasWritePermission", () => {
  it("checks a bunch of things that should work don't throw", () => {
    // these don't throw
    assertHasWritePermission({
      subject: `${SERVICE}.hub`,
      path: "hub/foo",
    });

    assertHasWritePermission({
      subject: `${SERVICE}.hub`,
      path: "hub/foo/blah xxx~!/xxxx",
    });

    assertHasWritePermission({
      subject: `${SERVICE}.project-${uuid}`,
      path: `projects/${uuid}/a.txt`,
    });

    assertHasWritePermission({
      subject: `${SERVICE}.account-${uuid}`,
      path: `accounts/${uuid}/c/d.txt`,
    });
  });

  it("now check many things that are NOT allowed", () => {
    const BAD = [
      { subject: `${SERVICE}.fubar`, path: "hub/foo/bar" },
      { subject: `fluber.hub`, path: "hub/foo" },
      {
        subject: `${SERVICE}.projects-${uuid}`,
        path: `projects/${uuid}/foo`,
      },
      {
        subject: `${SERVICE}.accounts-${uuid}`,
        path: `accounts/${uuid}/foo`,
      },
      {
        subject: `${SERVICE}.project-${uuid}`,
        path: `accounts/${uuid}/foo`,
      },
      {
        subject: `${SERVICE}.account-${uuid}`,
        path: `projects/${uuid}/foo`,
      },
      {
        subject: `${SERVICE}.account-${uuid}`,
        path: `accounts/${uuid2}/foo`,
      },
      {
        subject: `${SERVICE}.project-${uuid}`,
        path: `projects/${uuid2}/foo`,
      },
      {
        subject: `${SERVICE}.project-${uuid}`,
        path: `projects/${uuid}/`,
      },
      {
        subject: `${SERVICE}.project-${uuid}`,
        path: `projects/${uuid}`,
      },
      {
        subject: `${SERVICE}.project-${uuid}`,
        path: `projects/${uuid}/foo/`,
      },
      {
        subject: `${SERVICE}.project-${uuid}`,
        path: `projects/${uuid}/${"a".repeat(100000)}`,
      },
      {
        subject: `${SERVICE}.project-${uuid}x`,
        path: `projects/${uuid}x/a.txt`,
      },
    ];

    for (const { subject, path } of BAD) {
      expect(() => assertHasWritePermission({ subject, path })).toThrow();
    }
  });
});
