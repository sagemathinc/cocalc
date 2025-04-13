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
});
