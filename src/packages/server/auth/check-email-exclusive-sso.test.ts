import { checkEmailExclusiveSSO } from "./check-email-exclusive-sso";
import getStrategies from "@cocalc/database/settings/get-sso-strategies";

jest.mock("@cocalc/database/settings/get-sso-strategies");

const mockedGetStrategies = getStrategies as jest.MockedFunction<
  typeof getStrategies
>;

const baseStrategy = {
  name: "saml",
  display: "University SSO",
  icon: "",
  backgroundColor: "",
  public: false,
  exclusiveDomains: ["university.edu"],
  doNotHide: false,
  updateOnLogin: false,
};

describe("checkEmailExclusiveSSO", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test("returns true when new email is in an exclusive domain", async () => {
    mockedGetStrategies.mockResolvedValueOnce([baseStrategy]);

    const db = {
      async_query: jest.fn(),
    } as any;

    await new Promise<void>((resolve, reject) => {
      checkEmailExclusiveSSO(
        db,
        "account",
        "user@university.edu",
        (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          expect(result).toBe(true);
          expect(db.async_query).not.toHaveBeenCalled();
          resolve();
        },
      );
    });
  });

  test("returns true when current email is in an exclusive domain", async () => {
    mockedGetStrategies.mockResolvedValueOnce([baseStrategy]);

    const db = {
      async_query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ email_address: "user@university.edu" }],
        }),
    } as any;

    await new Promise<void>((resolve, reject) => {
      checkEmailExclusiveSSO(db, "account", "user@gmail.com", (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        expect(result).toBe(true);
        resolve();
      });
    });
  });

  test("returns false when neither current nor new email are exclusive", async () => {
    mockedGetStrategies.mockResolvedValueOnce([baseStrategy]);

    const db = {
      async_query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ email_address: "user@gmail.com" }] }),
    } as any;

    await new Promise<void>((resolve, reject) => {
      checkEmailExclusiveSSO(db, "account", "user@yahoo.com", (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        expect(result).toBe(false);
        resolve();
      });
    });
  });
});
