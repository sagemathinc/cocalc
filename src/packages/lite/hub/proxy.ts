import { createProxyServer } from "http-proxy-3";
import getLogger from "@cocalc/backend/logger";
import { API_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";

const logger = getLogger("lite:hub:proxy");

export function initComputeServerProxy({ apiKey, address, httpServer }) {
  logger.debug(`initComputeServerProxy`, { address });
  const Cookie = `${API_COOKIE_NAME}=${apiKey}`;
  const headers = { Cookie };
  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url.startsWith("/conat-remote")) {
      return;
    }
    req.url = req.url.slice("/conat-remote".length);
    const target = address;
    logger.debug(`initComputeServerProxy: handle upgrade`, {
      url: req.url,
      address,
      target,
    });
    const proxy = createProxyServer({
      ws: true,
      secure: false,
      target,
      headers,
    });

    proxy.on("error", (err) => {
      logger.debug(`WARNING: compute server proxy error -- ${err}`, address);
    });

    proxy.ws(req, socket, head);
  });
}
