Below is the shortest reliable path to produce the exact three strings the Nebius JS SDK expects under "Using a service account (private key / credentials file):" at https://github.com/nebius/js-sdk?tab=readme-ov-file

It assumes you have installed the CLI nebius program as explained in http://docs.nebius.com/cli/quickstart

See also https://chatgpt.com/s/t_6954b3d283648191aee1aa850c1c4634

```ts
serviceAccountId: "serviceaccount-…",
publicKeyId: "publickey-…",
privateKeyPem: "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"
```

The JS SDK’s README shows this “serviceAccount object (id + key) directly” initialization pattern. ([GitHub][1])

---

## 1) Create (or identify) a service account ID

### A. Get your tenant ID (needed for permissions)

List tenants and pick the right one:

```bash
nebius iam tenant list --page-size 100 --format json | jq -r '.items[] | "\(.metadata.name)\t\(.metadata.id)"'
```

(That same `tenant list` flow is used in Nebius’s own setup script.) ([GitHub][2])

Export the one you want:

```bash
export TENANT_ID="tenant-…"
```

### B. Get your project ID

Nebius’s own CLI quickstart explicitly recommends copying the project ID from the web console (project switcher → “Copy project ID”). ([Nebius Docs][3])

Export it:

```bash
export PROJECT_ID="project-…"
```

### C. Create the service account (or use an existing one)

Create:

```bash
export SA_NAME="my-js-sdk-sa"

SA_JSON=$(nebius iam service-account create \
  --parent-id "$PROJECT_ID" \
  --name "$SA_NAME" \
  --format json)

export SA_ID=$(echo "$SA_JSON" | jq -r '.metadata.id')
echo "$SA_ID"
```

That `service-account create --parent-id <project>` pattern matches the public Nebius setup script. ([GitHub][2])

If you already created it earlier, you can look it up by name (as SkyPilot’s Nebius instructions show):

```bash
export SA_ID=$(nebius iam service-account get-by-name \
  --name "$SA_NAME" \
  --format json \
  | jq -r '.metadata.id')
```

([SkyPilot Docs][4])

---

## 2) Grant the service account permissions (typical: editors group)

A common quick start is adding the service account to the tenant’s `editors` group (you can tighten later).

```bash
EDITORS_GROUP_ID=$(nebius iam group get-by-name \
  --name editors \
  --parent-id "$TENANT_ID" \
  --format json | jq -r '.metadata.id')

nebius iam group-membership create \
  --parent-id "$EDITORS_GROUP_ID" \
  --member-id "$SA_ID" >/dev/null
```

This is exactly the approach used in Nebius’s published setup script. ([GitHub][2])

---

## 3) Generate an authorized key pair + a credentials JSON

Run:

```bash
mkdir -p ~/.nebius

nebius iam auth-public-key generate \
  --parent-id "$PROJECT_ID" \
  --service-account-id "$SA_ID" \
  --output ~/.nebius/credentials.json
```

The same command (including `--output ~/.nebius/credentials.json`) is documented by SkyPilot’s Nebius instructions. ([SkyPilot Docs][4])

---

The generated JSON is typically shaped like:

```json
{
  "subject-credentials": {
    "alg": "RS256",
    "private-key": "PKCS#8 PEM with new lines escaped as \n",
    "kid": "public-key-id",
    "iss": "service-account-id",
    "sub": "service-account-id"
  }
}
```

Key point: in Nebius’s auth scheme, `kid` is the **public key ID**, and `iss/sub` are the **service account ID** used in the JWT claim. ([GitHub][6])

---

## 4) Wire it into `@nebius/js-sdk`

This is already done by cocalc -- you just have to put credentials.json into the admin settings.

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SDK } from "@nebius/js-sdk";

const credsPath = path.join(os.homedir(), ".nebius", "credentials.json");
const raw = fs.readFileSync(credsPath, "utf8");
const creds = JSON.parse(raw);
const sc = creds["subject-credentials"];

const sdk = new SDK({
  serviceAccount: {
    serviceAccountId: sc.iss, // e.g. serviceaccount-...
    publicKeyId: sc.kid, // e.g. publickey-...
    privateKeyPem: sc["private-key"], // actual PEM with real newlines after JSON.parse
  },
});

// quick sanity check (the README shows whoami() for validation)
const profile = await sdk.whoami();
console.log(profile);

await sdk.close();
```

The SDK README shows both (a) the `serviceAccount: { serviceAccountId, publicKeyId, privateKeyPem }` constructor shape and (b) using `whoami()` to validate credentials. ([GitHub][1])


[1]: https://github.com/nebius/js-sdk "GitHub - nebius/js-sdk"
[2]: https://raw.githubusercontent.com/nebius/nebius-solution-library/refs/heads/main/skypilot/nebius-setup.sh "raw.githubusercontent.com"
[3]: https://docs.nebius.com/cli/quickstart?utm_source=chatgpt.com "Getting started with the Nebius AI Cloud CLI"
[4]: https://docs.skypilot.co/en/v0.10.2/cloud-setup/cloud-permissions/nebius.html "Nebius — SkyPilot documentation"
[5]: https://docs.skypilot.co/en/v0.9.3/cloud-setup/cloud-permissions/nebius.html "Nebius — SkyPilot documentation"
[6]: https://github.com/nebius/api "GitHub - nebius/api: Nebius AI Cloud API"
