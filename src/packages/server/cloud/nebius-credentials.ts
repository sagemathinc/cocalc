export type NebiusCredentials = {
  serviceAccountId: string;
  publicKeyId: string;
  privateKeyPem: string;
};

export function parseNebiusCredentialsJson(raw: string): NebiusCredentials {
  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/\n/g, "").replace(/\r/g, ""));
  } catch (err: any) {
    throw new Error(
      `nebius_credentials_json is not valid JSON: ${err?.message ?? err}`,
    );
  }
  const sc = parsed?.["subject-credentials"];
  if (!sc) {
    throw new Error(
      "nebius_credentials_json missing subject-credentials block",
    );
  }
  const serviceAccountId = sc.iss ?? sc.sub;
  const publicKeyId = sc.kid;
  const privateKeyPem = sc["private-key"];
  if (!serviceAccountId) {
    throw new Error("nebius_credentials_json missing subject-credentials.iss");
  }
  if (!publicKeyId) {
    throw new Error("nebius_credentials_json missing subject-credentials.kid");
  }
  if (!privateKeyPem) {
    throw new Error(
      "nebius_credentials_json missing subject-credentials.private-key",
    );
  }
  return {
    serviceAccountId,
    publicKeyId,
    privateKeyPem,
  };
}

export function getNebiusCredentialsFromSettings(settings): NebiusCredentials {
  const raw = settings.nebius_credentials_json;
  if (!raw) {
    throw new Error("nebius_credentials_json is not configured");
  }
  return parseNebiusCredentialsJson(raw);
}
