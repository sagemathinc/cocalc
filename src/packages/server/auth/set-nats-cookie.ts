import { NATS_JWT_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import Cookies from "cookies";
import { configureNatsUser, getJwt } from "@cocalc/server/nats/auth";
import { DEFAULT_MAX_AGE_MS } from "./set-sign-in-cookies";

export default async function setNatsCookie({
  req,
  res,
  account_id,
  maxAge = DEFAULT_MAX_AGE_MS,
}: {
  req;
  res;
  account_id: string;
  maxAge?: number;
}) {
  const jwt = await getJwt({ account_id });
  await configureNatsUser({ account_id });
  const cookies = new Cookies(req, res, { secure: true });
  cookies.set(NATS_JWT_COOKIE_NAME, jwt, {
    maxAge,
    sameSite: true,
  });
}
