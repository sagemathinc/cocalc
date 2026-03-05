import {
  emailBelongsToDomain,
  getEmailDomain,
  checkRequiredSSO,
} from "./auth-check-required-sso";
import { Strategy } from "./types/sso";

const SSO: Readonly<Omit<Strategy, "name" | "exclusiveDomains">> = {
  display: "",
  backgroundColor: "",
  public: false,
  doNotHide: true,
  updateOnLogin: true,
} as const;

describe("Check Required SSO", () => {
  test("getEmailDomain", () => {
    expect(getEmailDomain("foo@bar.com")).toBe("bar.com");
    expect(getEmailDomain("foo@bar.co.uk")).toBe("bar.co.uk");
  });

  test("emailBelongsToDomain", () => {
    expect(emailBelongsToDomain("foo.com", "foo.com")).toBe(true);
    expect(emailBelongsToDomain("bar.foo.com", "foo.com")).toBe(true);
    expect(emailBelongsToDomain("foo.com", "bar.com")).toBe(false);
    expect(emailBelongsToDomain("foo.com", "foo.co.uk")).toBe(false);
    expect(emailBelongsToDomain("foo.com", "foo.com.uk")).toBe(false);
    expect(emailBelongsToDomain("foobar.com", "bar.com")).toBe(false);
    expect(emailBelongsToDomain("foobar.com", "bazfoobar.com")).toBe(false);
    expect(emailBelongsToDomain("foobar.com", "*")).toBe(false);
  });

  const foo = { name: "foo", exclusiveDomains: ["foo.co.uk"], ...SSO };
  const bar = { name: "bar", exclusiveDomains: ["*"], ...SSO };
  const baz = {
    name: "baz",
    exclusiveDomains: ["baz.com", "abc.com"],
    ...SSO,
  };

  test("checkRequiredSSO", () => {
    const strategies: Strategy[] = [foo, baz] as const;

    expect(checkRequiredSSO({ email: "x@baz.com", strategies })?.name).toEqual(
      "baz",
    );
    expect(
      checkRequiredSSO({ email: "x@foo.abc.com", strategies })?.name,
    ).toEqual("baz");
    expect(
      checkRequiredSSO({ email: "instructor+123@foo.co.uk", strategies })?.name,
    ).toEqual("foo");
    expect(
      checkRequiredSSO({ email: "x@students.foo.co.uk", strategies })?.name,
    ).toEqual("foo");
    // no match on naive substring from the right
    expect(
      checkRequiredSSO({ email: "abc@foobaz.com", strategies }),
    ).toBeUndefined();
    // no catch-all for an unrelated domain, returns no strategy
    expect(
      checkRequiredSSO({ email: "x@gmail.com", strategies }),
    ).toBeUndefined();
  });

  test("checkRequiredSSO/catchall", () => {
    const strategies: Strategy[] = [foo, bar, baz] as const;

    expect(checkRequiredSSO({ email: "x@baz.com", strategies })?.name).toEqual(
      "baz",
    );
    expect(
      checkRequiredSSO({ email: "x@foo.abc.com", strategies })?.name,
    ).toEqual("baz");
    expect(
      checkRequiredSSO({ email: "x@students.foo.co.uk", strategies })?.name,
    ).toEqual("foo");
    // this is the essential difference to above
    expect(
      checkRequiredSSO({ email: "x@gmail.com", strategies })?.name,
    ).toEqual("bar");
  });

  test("checkRequiredSSO/specificStrategy", () => {
    const strategies: Strategy[] = [foo, bar, baz] as const;

    // When specificStrategy is set, only that strategy should match
    expect(
      checkRequiredSSO({
        email: "x@baz.com",
        strategies,
        specificStrategy: "baz",
      })?.name,
    ).toEqual("baz");

    // Should not match other strategies even if domain matches
    expect(
      checkRequiredSSO({
        email: "x@baz.com",
        strategies,
        specificStrategy: "foo",
      }),
    ).toBeUndefined();

    // Wildcard should work with specificStrategy
    expect(
      checkRequiredSSO({
        email: "x@gmail.com",
        strategies,
        specificStrategy: "bar",
      })?.name,
    ).toEqual("bar");

    // SECURITY: specificStrategy should prevent wildcard from other strategies
    expect(
      checkRequiredSSO({
        email: "x@gmail.com",
        strategies,
        specificStrategy: "foo",
      }),
    ).toBeUndefined();
  });

  test("getEmailDomain/edge-cases", () => {
    // Normal cases with whitespace and case variations
    expect(getEmailDomain("  foo@bar.com  ")).toBe("bar.com");
    expect(getEmailDomain("foo@BAR.COM")).toBe("bar.com");
    expect(getEmailDomain("FOO@BAR.COM")).toBe("bar.com");

    // Note: Multiple @ signs (like "foo@bar@baz.com") are rejected by
    // is_valid_email_address before getEmailDomain is called, so no test needed
  });

  test("emailBelongsToDomain/normalized-domains", () => {
    // Both emailDomain and ssoDomain are normalized to lowercase at the source
    expect(emailBelongsToDomain("bar.com", "bar.com")).toBe(true);
    expect(emailBelongsToDomain("foo.bar.com", "bar.com")).toBe(true);

    // All domains from getEmailDomain and database queries are lowercase
    expect(emailBelongsToDomain("university.edu", "university.edu")).toBe(true);
    expect(emailBelongsToDomain("mail.university.edu", "university.edu")).toBe(
      true,
    );
    expect(emailBelongsToDomain("foo.com", "foo.com")).toBe(true);

    // Edge case: ensure no partial string matches
    expect(emailBelongsToDomain("barbarbar.com", "bar.com")).toBe(false);
    expect(emailBelongsToDomain("xbar.com", "bar.com")).toBe(false);
  });

  test("checkRequiredSSO/invalid-inputs", () => {
    const strategies: Strategy[] = [foo, bar, baz] as const;

    // Invalid email addresses should return undefined
    expect(checkRequiredSSO({ email: "", strategies })).toBeUndefined();
    expect(checkRequiredSSO({ email: undefined, strategies })).toBeUndefined();
    expect(
      checkRequiredSSO({ email: "notanemail", strategies }),
    ).toBeUndefined();
    expect(
      checkRequiredSSO({ email: "@domain.com", strategies }),
    ).toBeUndefined();
    expect(checkRequiredSSO({ email: "user@", strategies })).toBeUndefined();

    // No strategies
    expect(
      checkRequiredSSO({ email: "x@baz.com", strategies: [] }),
    ).toBeUndefined();
    expect(
      checkRequiredSSO({ email: "x@baz.com", strategies: undefined }),
    ).toBeUndefined();
  });

  test("checkRequiredSSO/strategy-priority", () => {
    // When multiple strategies could match, first one wins
    const dup1 = { name: "dup1", exclusiveDomains: ["test.com"], ...SSO };
    const dup2 = { name: "dup2", exclusiveDomains: ["test.com"], ...SSO };
    const strategies: Strategy[] = [dup1, dup2] as const;

    expect(checkRequiredSSO({ email: "x@test.com", strategies })?.name).toEqual(
      "dup1",
    );

    // Wildcard order matters too
    const wild1 = { name: "wild1", exclusiveDomains: ["*"], ...SSO };
    const wild2 = { name: "wild2", exclusiveDomains: ["*"], ...SSO };
    const wildStrategies: Strategy[] = [wild1, wild2] as const;

    expect(
      checkRequiredSSO({ email: "x@anything.com", strategies: wildStrategies })
        ?.name,
    ).toEqual("wild1");
  });

  test("checkRequiredSSO/empty-exclusiveDomains", () => {
    const emptyDomains = {
      name: "empty",
      exclusiveDomains: [],
      ...SSO,
    };
    const strategies: Strategy[] = [emptyDomains] as const;

    expect(
      checkRequiredSSO({ email: "x@test.com", strategies }),
    ).toBeUndefined();
  });

  test("checkRequiredSSO/subdomain-matching", () => {
    const strategies: Strategy[] = [baz] as const;

    // Direct domain match
    expect(checkRequiredSSO({ email: "x@abc.com", strategies })?.name).toEqual(
      "baz",
    );

    // Subdomain matches
    expect(
      checkRequiredSSO({ email: "x@mail.abc.com", strategies })?.name,
    ).toEqual("baz");
    expect(
      checkRequiredSSO({ email: "x@foo.bar.abc.com", strategies })?.name,
    ).toEqual("baz");

    // Should not match partial string (already tested but important)
    expect(
      checkRequiredSSO({ email: "x@notabc.com", strategies }),
    ).toBeUndefined();
    expect(
      checkRequiredSSO({ email: "x@abcd.com", strategies }),
    ).toBeUndefined();
  });
});
