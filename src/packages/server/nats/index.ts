import { connect, credsAuthenticator } from "nats";
import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";

const logger = getLogger("server:nats");

const creds = `-----BEGIN NATS USER JWT-----
eyJ0eXAiOiJKV1QiLCJhbGciOiJlZDI1NTE5LW5rZXkifQ.eyJqdGkiOiJFNUhFT1g3VFJETVNCVzdWRUNTVkRDRVlZVkRON0lZNUMyVzZNWEw2RVRVQVJSNDVZTkhBIiwiaWF0IjoxNzM3NDkxNTMwLCJpc3MiOiJBQjJLVEVGUFIyTzc2UE9aVVBZRVFTS1RaQVg2R0lOQVZUNkpXU0g2UUI3TENNNFhIRlRITVgyTCIsIm5hbWUiOiJodWIiLCJzdWIiOiJVQUhTQ1hVUVEzSFVVRlFIV0xUN0tYVDRXSU1ZSkdSQ1VLUUROWEZQRURCNU1WWkNMNkJKTldWVSIsIm5hdHMiOnsicHViIjp7ImFsbG93IjpbIl9JTkJPWC5cdTAwM2UiXX0sInN1YiI6eyJhbGxvdyI6WyJodWIuXHUwMDNlIl19LCJzdWJzIjotMSwiZGF0YSI6LTEsInBheWxvYWQiOi0xLCJ0eXBlIjoidXNlciIsInZlcnNpb24iOjJ9fQ.yaXnOnTFqJQvTwkdWpRS9nQSSZJrUKJRqJYcqUj1ymz_eDdEZ-UdKrFCIFT7GSkbhIRlt5E6GCAeYZx2X9brCg
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
