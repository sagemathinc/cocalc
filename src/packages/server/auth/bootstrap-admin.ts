import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import siteURL from "@cocalc/database/settings/site-url";
import { isPgliteEnabled } from "@cocalc/database/pool/pglite";
import { secure_random_token } from "@cocalc/util/misc";

const logger = getLogger("server:auth:bootstrap-admin");

const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;

type BootstrapToken = {
  token: string;
  expires: Date | null;
};

function isBootstrapCustomize(customize: unknown): boolean {
  return (
    !!customize &&
    typeof customize === "object" &&
    (customize as { bootstrap?: boolean }).bootstrap === true
  );
}

async function findBootstrapToken(): Promise<BootstrapToken | undefined> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    `SELECT token, expires, customize
       FROM registration_tokens
      WHERE disabled IS NOT true
        AND (expires IS NULL OR expires > NOW())
      ORDER BY expires NULLS LAST, token
      LIMIT 100`,
  );
  for (const row of rows ?? []) {
    if (isBootstrapCustomize(row.customize)) {
      return { token: row.token, expires: row.expires ?? null };
    }
  }
  return undefined;
}

async function createBootstrapToken(): Promise<BootstrapToken> {
  const pool = getPool();
  const token = secure_random_token(32);
  const expires = new Date(Date.now() + BOOTSTRAP_TTL_MS);
  await pool.query(
    `INSERT INTO registration_tokens
        (token, descr, expires, "limit", disabled, customize)
      VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      token,
      "Bootstrap Admin",
      expires,
      1,
      false,
      { make_admin: true, bootstrap: true },
    ],
  );
  return { token, expires };
}

function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

async function formatBootstrapLink(
  token: string,
  baseUrl?: string,
): Promise<string> {
  const base = withTrailingSlash(baseUrl ?? (await siteURL()));
  const url = new URL("auth/sign-up", base);
  url.searchParams.set("registrationToken", token);
  url.searchParams.set("bootstrap", "1");
  return url.toString();
}

export async function ensureBootstrapAdminToken(
  opts: { baseUrl?: string } = {},
): Promise<string | undefined> {
  if (!isPgliteEnabled()) {
    return;
  }
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM accounts WHERE coalesce(deleted,false)=false AND 'admin' = ANY(groups)",
  );
  if ((rows?.[0]?.count ?? 0) > 0) {
    return;
  }

  let tokenInfo = await findBootstrapToken();
  if (!tokenInfo) {
    tokenInfo = await createBootstrapToken();
  }

  const url = await formatBootstrapLink(tokenInfo.token, opts.baseUrl);
  logger.info("bootstrap admin token ready", {
    expires: tokenInfo.expires?.toISOString() ?? null,
  });
  return url;
}
