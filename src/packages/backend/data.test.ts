import { readFileSync } from "fs";

import {
  PsqlSSLEnvConfig,
  SSLConfig,
  sslConfigFromCoCalcEnv,
  sslConfigToPsqlEnv,
} from "./data";

enum TestString {
  SSL="tRuE",
  SSL_CA_FILE="test_ca_path",
  SSL_CLIENT_CERT_FILE="test_client_cert",
  SSL_CLIENT_KEY_FILE="test_client_key",
  SSL_CLIENT_KEY_PASSPHRASE="test_client_key_passphrase",
}

const mockFileContents = {
  [TestString.SSL_CA_FILE]: "ca-file-stuff",
  [TestString.SSL_CLIENT_CERT_FILE]: "client-cert-file-stuff",
  [TestString.SSL_CLIENT_KEY_FILE]: "client-key-file-stuff",
}

jest.mock("fs");
const mockReadFileSync = jest.mocked(readFileSync);

describe("#sslConfigFromCoCalcEnv", () => {
  beforeEach(() => {
    mockReadFileSync.mockImplementation((fileName) => mockFileContents[fileName as TestString]);
  });

  afterEach(() => {
    mockReadFileSync.mockClear();
  });

  it("returns false when provided empty configuration", async () => {
    // Arrange
    //
    const expected = false;

    // Act
    //
    const pgssl = sslConfigFromCoCalcEnv();

    // Assert
    //
    expect(pgssl).toEqual<SSLConfig>(expected);
  });

  it("returns true when SMC_DB_SSL field is not true (case insensitive)", async () => {
    // Arrange
    //
    const expected = true;

    // Act
    //
    const pgssl = sslConfigFromCoCalcEnv({
      SMC_DB_SSL: TestString.SSL,
    });

    // Assert
    //
    expect(pgssl).toEqual<SSLConfig>(expected);
  });

  it("returns false when SMC_DB_SSL field is not 'true' and no other configuration is provided", () => {
    // Arrange
    //
    const expected = false;

    // Act
    //
    const pgssl = sslConfigFromCoCalcEnv({
      SMC_DB_SSL: `!${TestString.SSL}`,
    });

    // Assert
    //
    expect(pgssl).toEqual<SSLConfig>(expected);
  });


  it("sets SSL config fields when provided", async () => {
    // Arrange
    //
    const expected = {
      caFile: TestString.SSL_CA_FILE,
      ca: mockFileContents[TestString.SSL_CA_FILE],
      clientCertFile: TestString.SSL_CLIENT_CERT_FILE,
      cert: mockFileContents[TestString.SSL_CLIENT_CERT_FILE],
      clientKeyFile: TestString.SSL_CLIENT_KEY_FILE,
      key: mockFileContents[TestString.SSL_CLIENT_KEY_FILE],
      passphrase: TestString.SSL_CLIENT_KEY_PASSPHRASE,
    };

    // Act
    //
    const pgssl = sslConfigFromCoCalcEnv({
      SMC_DB_SSL_CA_FILE: TestString.SSL_CA_FILE,
      SMC_DB_SSL_CLIENT_CERT_FILE: TestString.SSL_CLIENT_CERT_FILE,
      SMC_DB_SSL_CLIENT_KEY_FILE: TestString.SSL_CLIENT_KEY_FILE,
      SMC_DB_SSL_CLIENT_KEY_PASSPHRASE: TestString.SSL_CLIENT_KEY_PASSPHRASE,
    })

    // Assert
    //
    expect(pgssl).toEqual<SSLConfig>(expected);
  });

  it("ignores 'enabled' config field when other params are provided", async () => {
    // Arrange
    //
    const expected = {
      caFile: TestString.SSL_CA_FILE,
      ca: mockFileContents[TestString.SSL_CA_FILE],
    };

    // Act
    //
    const pgssl = sslConfigFromCoCalcEnv({
      SMC_DB_SSL: `!${TestString.SSL}`,
      SMC_DB_SSL_CA_FILE: TestString.SSL_CA_FILE,
    });

    // Assert
    //
    expect(pgssl).toEqual<SSLConfig>(expected);
  });

  it("reads SSL config fields from process.env by default", async () => {
    // Arrange
    //
    const expected = {
      caFile: TestString.SSL_CA_FILE,
      ca: mockFileContents[TestString.SSL_CA_FILE],
      clientCertFile: TestString.SSL_CLIENT_CERT_FILE,
      cert: mockFileContents[TestString.SSL_CLIENT_CERT_FILE],
      clientKeyFile: TestString.SSL_CLIENT_KEY_FILE,
      key: mockFileContents[TestString.SSL_CLIENT_KEY_FILE],
      passphrase: TestString.SSL_CLIENT_KEY_PASSPHRASE,
    };

    process.env = {
      SMC_DB_SSL_CA_FILE: TestString.SSL_CA_FILE,
      SMC_DB_SSL_CLIENT_CERT_FILE: TestString.SSL_CLIENT_CERT_FILE,
      SMC_DB_SSL_CLIENT_KEY_FILE: TestString.SSL_CLIENT_KEY_FILE,
      SMC_DB_SSL_CLIENT_KEY_PASSPHRASE: TestString.SSL_CLIENT_KEY_PASSPHRASE,
    }

    // Act
    //
    const pgssl = sslConfigFromCoCalcEnv();

    // Assert
    //
    expect(pgssl).toEqual<SSLConfig>(expected);
  });

  it("throws error when CA cert file cannot be read", async () => {
    // Arrange
    //
    const readError = new Error("dude where's my ca file");
    mockReadFileSync.mockImplementation(() => {
      throw readError;
    });

    // Act/Assert
    //
    expect(() => sslConfigFromCoCalcEnv({
      SMC_DB_SSL_CA_FILE: TestString.SSL_CA_FILE,
    })).toThrow(readError);
  });

  it("throws error when client cert file cannot be read", async () => {
    // Arrange
    //
    const readError = new Error("dude where's my cert file");
    mockReadFileSync.mockImplementation(() => {
      throw readError;
    });

    // Act/Assert
    //
    expect(() => sslConfigFromCoCalcEnv({
      SMC_DB_SSL_CLIENT_CERT_FILE: TestString.SSL_CLIENT_CERT_FILE,
    })).toThrow(readError);
  });

  it("throws error when client key file cannot be read", async () => {
    // Arrange
    //
    const readError = new Error("dude where's my key file");
    mockReadFileSync.mockImplementation(() => {
      throw readError;
    });

    // Act/Assert
    //
    expect(() => sslConfigFromCoCalcEnv({
      SMC_DB_SSL_CLIENT_KEY_FILE: TestString.SSL_CLIENT_KEY_FILE,
    })).toThrow(readError);
  });
});

describe("#sslConfigToPsqlEnv", () => {
  it("returns empty object when provided config is undefined", async () => {
    // Arrange
    //
    const expected: PsqlSSLEnvConfig = {};

    // Act
    //
    const env = sslConfigToPsqlEnv(undefined);

    // Assert
    //
    expect(env).toEqual<PsqlSSLEnvConfig>(expected);
  });

  it("returns empty object when provided config is false", async () => {
    // Arrange
    //
    const expected: PsqlSSLEnvConfig = {};

    // Act
    //
    const env = sslConfigToPsqlEnv(false);

    // Assert
    //
    expect(env).toEqual<PsqlSSLEnvConfig>(expected);
  });

  it("configures SSL mode to require when provided config is true", async () => {
    // Arrange
    //
    const expected: PsqlSSLEnvConfig = {
      PGSSLMODE: "require",
    };

    // Act
    //
    const env = sslConfigToPsqlEnv(true);

    // Assert
    //
    expect(env).toEqual<PsqlSSLEnvConfig>(expected);
  });

  it("validates against the system cert store when provided empty configuration", async () => {
    // Arrange
    //
    const expected: PsqlSSLEnvConfig = {
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: "system",
    };

    // Act
    //
    const env = sslConfigToPsqlEnv({});

    // Assert
    //
    expect(env).toEqual<PsqlSSLEnvConfig>(expected);
  });

  it("validates against a custom certificate authority when provided", async () => {
    // Arrange
    //
    const expected: PsqlSSLEnvConfig = {
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: TestString.SSL_CA_FILE,
    };

    // Act
    //
    const env = sslConfigToPsqlEnv({
      caFile: TestString.SSL_CA_FILE,
    });

    // Assert
    //
    expect(env).toEqual<PsqlSSLEnvConfig>(expected);
  });

  it("uses a client cert when provided", async () => {
    // Arrange
    //
    const expected: PsqlSSLEnvConfig = {
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: "system",
      PGSSLCERT: TestString.SSL_CLIENT_CERT_FILE,
    };

    // Act
    //
    const env = sslConfigToPsqlEnv({
      clientCertFile: TestString.SSL_CLIENT_CERT_FILE,
    });

    // Assert
    //
    expect(env).toEqual<PsqlSSLEnvConfig>(expected);
  });

  it("uses a client key when provided", async () => {
    // Arrange
    //
    const expected: PsqlSSLEnvConfig = {
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: "system",
      PGSSLKEY: TestString.SSL_CLIENT_KEY_FILE,
    };

    // Act
    //
    const env = sslConfigToPsqlEnv({
      clientKeyFile: TestString.SSL_CLIENT_KEY_FILE,
    });

    // Assert
    //
    expect(env).toEqual<PsqlSSLEnvConfig>(expected);
  });
});
