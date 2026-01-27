import setEmailAddress from "./set-email-address";
import getPool from "@cocalc/database/pool";
import getStrategies from "@cocalc/database/settings/get-sso-strategies";
import passwordHash, {
  verifyPassword,
} from "@cocalc/backend/auth/password-hash";
import accountCreationActions, {
  creationActionsDone,
} from "./account-creation-actions";
import sendEmailVerification from "./send-email-verification";

jest.mock("@cocalc/database/pool");
jest.mock("@cocalc/database/settings/get-sso-strategies");
jest.mock("@cocalc/backend/auth/password-hash", () => ({
  __esModule: true,
  default: jest.fn(() => "hashed-password"),
  verifyPassword: jest.fn(() => true),
}));
jest.mock("./account-creation-actions", () => ({
  __esModule: true,
  default: jest.fn(),
  creationActionsDone: jest.fn(),
}));
jest.mock("./send-email-verification", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedGetStrategies = getStrategies as jest.MockedFunction<
  typeof getStrategies
>;
const mockedVerifyPassword = verifyPassword as jest.MockedFunction<
  typeof verifyPassword
>;
const mockedAccountCreationActions =
  accountCreationActions as jest.MockedFunction<typeof accountCreationActions>;
const mockedCreationActionsDone = creationActionsDone as jest.MockedFunction<
  typeof creationActionsDone
>;
const mockedSendEmailVerification =
  sendEmailVerification as jest.MockedFunction<typeof sendEmailVerification>;

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const PASSWORD = "long-enough-password";

const exclusiveStrategy = {
  name: "saml",
  display: "University SSO",
  icon: "",
  backgroundColor: "",
  public: false,
  exclusiveDomains: ["university.edu"],
  doNotHide: false,
  updateOnLogin: false,
};

describe("setEmailAddress", () => {
  let query: jest.Mock;

  beforeEach(() => {
    query = jest.fn();
    mockedGetPool.mockReturnValue({ query } as any);
    mockedVerifyPassword.mockReturnValue(true);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("blocks email change when current email is exclusive", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          email_address: "user@university.edu",
          password_hash: "hash",
          email_address_verified: {},
          stripe_customer_id: null,
        },
      ],
    });
    mockedGetStrategies.mockResolvedValueOnce([exclusiveStrategy]);

    await expect(
      setEmailAddress({
        account_id: ACCOUNT_ID,
        email_address: "new@gmail.com",
        password: PASSWORD,
      }),
    ).rejects.toThrow("You are not allowed to change your email address");

    expect(query).toHaveBeenCalledTimes(1);
    expect(mockedVerifyPassword).not.toHaveBeenCalled();
  });

  test("blocks email change to an exclusive domain", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          email_address: "user@gmail.com",
          password_hash: "hash",
          email_address_verified: {},
          stripe_customer_id: null,
        },
      ],
    });
    mockedGetStrategies.mockResolvedValueOnce([exclusiveStrategy]);

    await expect(
      setEmailAddress({
        account_id: ACCOUNT_ID,
        email_address: "new@university.edu",
        password: PASSWORD,
      }),
    ).rejects.toThrow("You are not allowed to change your email address");

    expect(query).toHaveBeenCalledTimes(1);
    expect(mockedVerifyPassword).not.toHaveBeenCalled();
  });

  test("updates email when allowed", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            email_address: "user@gmail.com",
            password_hash: "hash",
            email_address_verified: {},
            stripe_customer_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    mockedGetStrategies.mockResolvedValueOnce([]);

    await expect(
      setEmailAddress({
        account_id: ACCOUNT_ID,
        email_address: "new@gmail.com",
        password: PASSWORD,
      }),
    ).resolves.toBeUndefined();

    expect(mockedVerifyPassword).toHaveBeenCalledWith(PASSWORD, "hash");
    expect(query).toHaveBeenCalledWith(
      "UPDATE accounts SET email_address=$1 WHERE account_id=$2",
      ["new@gmail.com", ACCOUNT_ID],
    );
    expect(mockedAccountCreationActions).toHaveBeenCalled();
    expect(mockedCreationActionsDone).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(mockedSendEmailVerification).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(passwordHash).not.toHaveBeenCalled();
  });
});
