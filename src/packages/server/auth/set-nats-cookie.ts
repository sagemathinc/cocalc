import { NATS_JWT_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import Cookies from "cookies";
import {
  configureNatsUser,
  getJwt,
  type CoCalcUser,
} from "@cocalc/server/nats/auth";
import { DEFAULT_MAX_AGE_MS } from "./set-sign-in-cookies";

export default async function setNatsCookie({
  req,
  res,
  account_id,
  project_id,
  maxAge = DEFAULT_MAX_AGE_MS,
}: {
  req;
  res;
  account_id?: string;
  project_id?: string;
  maxAge?: number;
}) {
  if (account_id == null && project_id == null) {
    throw Error("one of account_id or project_id must be specified");
  }
  const user = { account_id, project_id } as CoCalcUser;
  const jwt = await getJwt(user);
  await configureNatsUser(user);
  const cookies = new Cookies(req, res, { secure: true });
  cookies.set(NATS_JWT_COOKIE_NAME, jwt, {
    maxAge,
    sameSite: true,
  });
}
