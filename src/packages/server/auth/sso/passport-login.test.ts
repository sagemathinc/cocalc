import { getPassportCache } from "@cocalc/database/postgres/auth/passport-store";
import isBanned from "@cocalc/server/accounts/is-banned";
import clientSideRedirect from "@cocalc/server/auth/client-side-redirect";
import { getAccountIdFromRememberMe } from "@cocalc/server/auth/get-account";
import { PassportLogin } from "./passport-login";
import { SSO_LINK_ACCOUNT_COOKIE_NAME } from "./consts";

jest.mock("cookies", () => ({
  __esModule: true,
  __mock: {
    setValues(values: Record<string, string>) {
      this.values = new Map(Object.entries(values));
    },
    values: new Map<string, string>(),
  },
  default: class MockCookies {
    constructor(_req, _res?) {}

    get(name: string) {
      return jest.requireMock("cookies").__mock.values.get(name);
    }

    set(name: string, value?: string) {
      if (value == null) {
        jest.requireMock("cookies").__mock.values.delete(name);
        return;
      }
      jest.requireMock("cookies").__mock.values.set(name, value);
    }
  },
}));
jest.mock("@cocalc/database/postgres/auth/passport-store", () => ({
  __esModule: true,
  getPassportCache: jest.fn(),
}));
jest.mock("@cocalc/server/accounts/account-creation-actions", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("@cocalc/server/accounts/get-email-address", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("@cocalc/server/accounts/is-banned", () => ({
  __esModule: true,
  default: jest.fn(async () => false),
}));
jest.mock("@cocalc/server/auth/get-account", () => ({
  __esModule: true,
  getAccountIdFromRememberMe: jest.fn(),
}));
jest.mock("@cocalc/server/auth/client-side-redirect", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("@cocalc/server/auth/set-sign-in-cookies", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("@cocalc/server/auth/sso/sanitize-id", () => ({
  __esModule: true,
  sanitizeID: jest.fn(),
}));
jest.mock("@cocalc/server/auth/sso/sanitize-profile", () => ({
  __esModule: true,
  sanitizeProfile: jest.fn(),
}));

const mockedGetPassportCache = getPassportCache as jest.MockedFunction<
  typeof getPassportCache
>;
const mockedClientSideRedirect = clientSideRedirect as jest.MockedFunction<
  typeof clientSideRedirect
>;
const mockedIsBanned = isBanned as jest.MockedFunction<typeof isBanned>;
const mockedGetAccountIdFromRememberMe =
  getAccountIdFromRememberMe as jest.MockedFunction<
    typeof getAccountIdFromRememberMe
  >;
const mockedCookies = jest.requireMock("cookies").__mock as {
  setValues: (values: Record<string, string>) => void;
};

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ACCOUNT_ID = "22222222-2222-2222-2222-222222222222";
const TEST_EMAIL = "user@example.com";

function createLogin(databaseOverrides: Partial<any> = {}) {
  const database = {
    account_exists: jest.fn(),
    create_passport: jest.fn(),
    get_remember_me: jest.fn(),
    passport_exists: jest.fn(),
    ...databaseOverrides,
  };

  return {
    database,
    login: new PassportLogin({
      passports: {
        saml: {
          strategy: "saml",
          conf: { type: "saml" },
          info: { display: "Example SSO" },
        },
      },
      database: database as any,
      host: "localhost",
      id: "saml-user-1",
      profile: { id: "saml-user-1" },
      strategyName: "saml",
      emails: [TEST_EMAIL],
      first_name: "Test",
      last_name: "User",
      req: {},
      res: {},
      site_url: "https://example.com/app",
      update_on_login: false,
    }),
  };
}

describe("PassportLogin authenticated linking", () => {
  beforeEach(() => {
    mockedCookies.setValues({});
    mockedClientSideRedirect.mockReset();
    mockedIsBanned.mockResolvedValue(false);
    mockedGetAccountIdFromRememberMe.mockReset();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("uses the authenticated link cookie to attach SSO to the current account", async () => {
    const getAsync = jest.fn(async () =>
      JSON.stringify({
        account_id: ACCOUNT_ID,
        remember_me_hash: "active-remember-me-hash",
      }),
    );
    const removeAsync = jest.fn(async () => undefined);
    mockedGetAccountIdFromRememberMe.mockResolvedValue(ACCOUNT_ID);
    mockedGetPassportCache.mockReturnValue({
      getAsync,
      removeAsync,
      saveAsync: jest.fn(),
    } as any);
    mockedCookies.setValues({
      [SSO_LINK_ACCOUNT_COOKIE_NAME]: "link-token",
    });

    const { login, database } = createLogin({
      passport_exists: jest.fn(async () => undefined),
    });

    await expect(login.login()).resolves.toBeUndefined();

    expect(getAsync).toHaveBeenCalledWith("link-token");
    expect(mockedGetAccountIdFromRememberMe).toHaveBeenCalledWith(
      "active-remember-me-hash",
    );
    expect(removeAsync).toHaveBeenCalledWith("link-token");
    expect(database.create_passport).toHaveBeenCalledWith({
      account_id: ACCOUNT_ID,
      strategy: "saml",
      id: "saml-user-1",
      profile: { id: "saml-user-1" },
      email_address: TEST_EMAIL,
      first_name: "Test",
      last_name: "User",
    });
    expect(database.account_exists).not.toHaveBeenCalled();
    expect(mockedClientSideRedirect).toHaveBeenCalled();
  });

  test("still rejects matching email addresses when there is no authenticated linking context", async () => {
    mockedGetAccountIdFromRememberMe.mockResolvedValue(undefined);
    mockedGetPassportCache.mockReturnValue({
      getAsync: jest.fn(async () => null),
      removeAsync: jest.fn(async () => undefined),
      saveAsync: jest.fn(),
    } as any);

    const { login, database } = createLogin({
      account_exists: jest.fn(({ email_address, cb }) =>
        cb(undefined, email_address === TEST_EMAIL ? OTHER_ACCOUNT_ID : null),
      ),
      passport_exists: jest.fn(async () => undefined),
    });

    await expect(login.login()).rejects.toThrow(
      `There is already an account with email address ${TEST_EMAIL}; please sign in using that email account, then link saml to it in account settings.`,
    );

    expect(database.create_passport).not.toHaveBeenCalled();
  });

  test("ignores stale link cookies if the original remember_me session was revoked", async () => {
    mockedGetAccountIdFromRememberMe.mockResolvedValue(undefined);
    mockedGetPassportCache.mockReturnValue({
      getAsync: jest.fn(async () =>
        JSON.stringify({
          account_id: ACCOUNT_ID,
          remember_me_hash: "stale-remember-me-hash",
        }),
      ),
      removeAsync: jest.fn(async () => undefined),
      saveAsync: jest.fn(),
    } as any);
    mockedCookies.setValues({
      [SSO_LINK_ACCOUNT_COOKIE_NAME]: "link-token",
    });

    const { login, database } = createLogin({
      account_exists: jest.fn(({ email_address, cb }) =>
        cb(undefined, email_address === TEST_EMAIL ? OTHER_ACCOUNT_ID : null),
      ),
      passport_exists: jest.fn(async () => undefined),
    });

    await expect(login.login()).rejects.toThrow(
      `There is already an account with email address ${TEST_EMAIL}; please sign in using that email account, then link saml to it in account settings.`,
    );

    expect(mockedGetAccountIdFromRememberMe).toHaveBeenCalledWith(
      "stale-remember-me-hash",
    );
    expect(database.create_passport).not.toHaveBeenCalled();
  });
});
