import { connect, credsAuthenticator } from "nats";
import getLogger from "@cocalc/backend/logger";
import { initAPI } from "./api";

const logger = getLogger("server:nats");

const creds = `-----BEGIN NATS USER JWT-----
eyJ0eXAiOiJKV1QiLCJhbGciOiJlZDI1NTE5LW5rZXkifQ.eyJqdGkiOiJVTDJaWEdFWFFKTzVRNjdLU1hKNDdERFpKSFE3QUFWMjdHWUtBN1ZJVjVaT01DQU1SN1hBIiwiaWF0IjoxNzM3NTY3OTQwLCJpc3MiOiJBRDRHNlI2MkJERFFVU0NKVkxaTkE3RVM3UjNBNkRXWExZVVdHWlY3NEVKMlM2VkJDN0RRVk0zSSIsIm5hbWUiOiJhZG1pbiIsInN1YiI6IlVBV1hZVUpYSEFXQzNPSFFURE1SQVBSWVpNNFQ0RkZDRk1TTVFLNDVCWU1SS0ZSRE5RTjQ0Vk1SIiwibmF0cyI6eyJwdWIiOnsiYWxsb3ciOlsiXHUwMDNlIl19LCJzdWIiOnsiYWxsb3ciOlsiXHUwMDNlIl19LCJzdWJzIjotMSwiZGF0YSI6LTEsInBheWxvYWQiOi0xLCJ0eXBlIjoidXNlciIsInZlcnNpb24iOjJ9fQ.Pv9-T3P7cO1VSFiNocGA0vCGvwQ-UaX3b7OzwMIHdn5hGs4kUv4eLE-Er_6dxrZiPu6PJjBYB7eD2hyb-gxSCQ
------END NATS USER JWT------

************************* IMPORTANT *************************
NKEY Seed printed below can be used to sign and prove identity.
NKEYs are sensitive and should be treated as secrets.

-----BEGIN USER NKEY SEED-----
SUAMW6S2OXSKL2ETX5GJE3NDLWGXZFZ4JAP5WHBCK43RMFDPJCCJLPWC5Y
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
