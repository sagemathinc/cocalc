import { connect, credsAuthenticator } from "nats";
import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";

const logger = getLogger("server:nats");

const creds = `-----BEGIN NATS USER JWT-----
eyJ0eXAiOiJKV1QiLCJhbGciOiJlZDI1NTE5LW5rZXkifQ.eyJqdGkiOiJNSEtXWTU0WDVNSUxXUEZBRkdRTFZVRkdTT0VCSDZUMjMyVjUzRzVRSjI3RFJWTFhOUk1BIiwiaWF0IjoxNzM3NDEwMTM4LCJpc3MiOiJBQjJLVEVGUFIyTzc2UE9aVVBZRVFTS1RaQVg2R0lOQVZUNkpXU0g2UUI3TENNNFhIRlRITVgyTCIsIm5hbWUiOiJodWIiLCJzdWIiOiJVQUhTQ1hVUVEzSFVVRlFIV0xUN0tYVDRXSU1ZSkdSQ1VLUUROWEZQRURCNU1WWkNMNkJKTldWVSIsIm5hdHMiOnsicHViIjp7ImFsbG93IjpbIl9JTkJPWC5cdTAwM2UiXX0sInN1YiI6eyJhbGxvdyI6WyJodWIuYXBpLlx1MDAzZSJdfSwic3VicyI6LTEsImRhdGEiOi0xLCJwYXlsb2FkIjotMSwidHlwZSI6InVzZXIiLCJ2ZXJzaW9uIjoyfX0.3lQtNIOlj1nEStkbTSz4j25T1tIYfshWVvjyYE-ArkcmmCpzynoYCxEyKF8QuMNdZ30YTYu6xxcqluzjVCk_DA
------END NATS USER JWT------

************************* IMPORTANT *************************
NKEY Seed printed below can be used to sign and prove identity.
NKEYs are sensitive and should be treated as secrets.

-----BEGIN USER NKEY SEED-----
SUAOMBSB4Z6XVTXWQCVZPG2OWM6C36UTP6O47ILTW3LC75HW5U2QCE3C5U
------END USER NKEY SEED------

*************************************************************
`;

export default async function initNatsServer() {
  logger.debug("initializing nats cocalc hub server");
  const nc = await connect({
    authenticator: credsAuthenticator(new TextEncoder().encode(creds)),
  });
  logger.debug(`connected to ${nc.getServer()}`);
  initAPI(nc);
}
