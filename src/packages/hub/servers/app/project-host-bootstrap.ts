import express, { Router, type Request } from "express";
import getPool from "@cocalc/database/pool";
import { getLogger } from "@cocalc/hub/logger";
import basePath from "@cocalc/backend/base-path";
import { conatPassword } from "@cocalc/backend/data";
import { buildCloudInitStartupScript } from "@cocalc/server/cloud/bootstrap-host";
import { verifyBootstrapToken } from "@cocalc/server/project-host/bootstrap-token";
import siteURL from "@cocalc/database/settings/site-url";

const logger = getLogger("hub:servers:app:project-host-bootstrap");

function pool() {
  return getPool();
}

function extractToken(req: Request): string | undefined {
  const header = req.get("authorization");
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

async function loadHostRow(hostId: string): Promise<any> {
  const { rows } = await pool().query(
    `SELECT * FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
    [hostId],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("host not found");
  }
  return row;
}

async function updateBootstrapStatus(
  hostId: string,
  status: string,
  message?: string,
): Promise<void> {
  const { rows } = await pool().query(
    `SELECT metadata FROM project_hosts WHERE id=$1 AND deleted IS NULL`,
    [hostId],
  );
  const metadata = rows[0]?.metadata ?? {};
  metadata.bootstrap = {
    ...(metadata.bootstrap ?? {}),
    status,
    updated_at: new Date().toISOString(),
    ...(message ? { message } : {}),
  };
  await pool().query(
    `UPDATE project_hosts SET metadata=$2, updated=NOW() WHERE id=$1 AND deleted IS NULL`,
    [hostId, metadata],
  );
}

export default function init(router: Router) {
  const jsonParser = express.json({ limit: "256kb" });

  router.get("/project-host/bootstrap", async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        res.status(401).send("missing bootstrap token");
        return;
      }
      const tokenInfo = await verifyBootstrapToken(token, {
        purpose: "bootstrap",
      });
      if (!tokenInfo) {
        res.status(401).send("invalid bootstrap token");
        return;
      }
      const hostRow = await loadHostRow(tokenInfo.host_id);
      let baseUrl: string;
      try {
        baseUrl = await siteURL();
      } catch {
        const hostHeader = req.get("host") ?? "";
        const proto = req.protocol;
        const base = basePath === "/" ? "" : basePath;
        baseUrl = `${proto}://${hostHeader}${base}`;
      }
      const script = await buildCloudInitStartupScript(
        hostRow,
        token,
        baseUrl,
      );
      res.type("text/x-shellscript").send(script);
    } catch (err) {
      logger.warn("bootstrap script failed", err);
      res.status(500).send("bootstrap script failed");
    }
  });

  router.post("/project-host/bootstrap/status", jsonParser, async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        res.status(401).send("missing bootstrap token");
        return;
      }
      const tokenInfo = await verifyBootstrapToken(token, {
        purpose: "bootstrap",
      });
      if (!tokenInfo) {
        res.status(401).send("invalid bootstrap token");
        return;
      }
      const status = String(req.body?.status ?? "");
      if (!status) {
        res.status(400).send("missing status");
        return;
      }
      const message = req.body?.message ? String(req.body.message) : undefined;
      await updateBootstrapStatus(tokenInfo.host_id, status, message);
      res.json({ ok: true });
    } catch (err) {
      logger.warn("bootstrap status update failed", err);
      res.status(500).send("bootstrap status update failed");
    }
  });

  router.get("/project-host/bootstrap/conat", async (req, res) => {
    try {
      const token = extractToken(req);
      if (!token) {
        res.status(401).send("missing bootstrap token");
        return;
      }
      const tokenInfo = await verifyBootstrapToken(token, {
        purpose: "bootstrap",
      });
      if (!tokenInfo) {
        res.status(401).send("invalid bootstrap token");
        return;
      }
      if (!conatPassword) {
        res.status(500).send("conat password not configured");
        return;
      }
      res.type("text/plain").send(conatPassword);
    } catch (err) {
      logger.warn("bootstrap conat password failed", err);
      res.status(500).send("bootstrap conat password failed");
    }
  });
}
