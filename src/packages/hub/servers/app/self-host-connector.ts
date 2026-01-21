// Self-host connector endpoints for user-managed project-host VMs.
// These routes support pairing a local connector daemon, polling for
// VM lifecycle commands, and acknowledging results, all without inbound
// access to the user’s machine.
import express, { Router, type Request } from "express";
import getPool from "@cocalc/database/pool";
import { getLogger } from "@cocalc/hub/logger";
import {
  activateConnector,
  createConnector,
  createPairingToken,
  revokePairingToken,
  verifyConnectorToken,
  verifyPairingToken,
} from "@cocalc/server/self-host/connector-tokens";
import getAccount from "@cocalc/server/auth/get-account";
import isAdmin from "@cocalc/server/accounts/is-admin";
import { enqueueCloudVmWorkOnce } from "@cocalc/server/cloud/db";
import { getLaunchpadMode, getLaunchpadOnPremConfig } from "@cocalc/server/launchpad/mode";

const logger = getLogger("hub:servers:app:self-host-connector");

function pool() {
  return getPool();
}

function extractToken(req: Request): string | undefined {
  const header = req.get("authorization");
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

async function maybeAutoStartHost(connector: {
  connector_id: string;
  account_id: string;
}) {
  const { rows } = await pool().query<{
    id: string;
    status: string | null;
    metadata: any;
  }>(
    `SELECT id, status, metadata
     FROM project_hosts
     WHERE region=$1
       AND deleted IS NULL
       AND metadata->>'owner' = $2`,
    [connector.connector_id, connector.account_id],
  );
  if (!rows.length) return;
  const host = rows.find(
    (row) => row.metadata?.machine?.cloud === "self-host",
  );
  if (!host || host.status !== "off") return;
  const nextMetadata = { ...(host.metadata ?? {}) };
  const selfHostMeta = { ...(nextMetadata.self_host ?? {}) };
  if (!selfHostMeta.auto_start_pending) return;
  if (nextMetadata.bootstrap) {
    delete nextMetadata.bootstrap;
  }
  selfHostMeta.auto_start_pending = false;
  selfHostMeta.auto_start_queued_at = new Date().toISOString();
  nextMetadata.self_host = selfHostMeta;
  await pool().query(
    `UPDATE project_hosts
     SET status=$2, last_seen=$3, metadata=$4, updated=NOW()
     WHERE id=$1 AND deleted IS NULL`,
    [host.id, "starting", new Date(), nextMetadata],
  );
  await enqueueCloudVmWorkOnce({
    vm_id: host.id,
    action: "start",
    payload: { provider: "self-host" },
  });
  logger.debug("self-host auto-start queued", {
    host_id: host.id,
    connector_id: connector.connector_id,
  });
}

export default function init(router: Router) {
  const jsonParser = express.json({ limit: "256kb" });
  const ensureOnPrem = async (
    res: express.Response,
  ): Promise<"onprem" | null> => {
    const mode = await getLaunchpadMode();
    if (mode !== "onprem") {
      res.status(409).send(`launchpad mode is '${mode}'`);
      return null;
    }
    return mode;
  };

  router.post("/self-host/pairing-token", jsonParser, async (req, res) => {
    try {
      if (!(await ensureOnPrem(res))) {
        return;
      }
      const account_id = await getAccount(req);
      if (!account_id) {
        res.status(401).send("user must be signed in");
        return;
      }
      const hostId = String(req.body?.host_id ?? "");
      if (!hostId) {
        res.status(400).send("missing host_id");
        return;
      }
      const { rows } = await pool().query<{
        id: string;
        name: string | null;
        region: string | null;
        metadata: any;
      }>(
        `SELECT id, name, region, metadata
         FROM project_hosts
         WHERE id=$1 AND deleted IS NULL`,
        [hostId],
      );
      const host = rows[0];
      const owner = host?.metadata?.owner ?? "";
      if (!host || owner !== account_id) {
        res.status(404).send("host not found");
        return;
      }
      const machineCloud = host.metadata?.machine?.cloud;
      if (machineCloud !== "self-host") {
        res.status(400).send("host is not self-hosted");
        return;
      }
      let connectorId = host.region;
      const attachConnector = async (id: string) => {
        const machine = host.metadata?.machine ?? {};
        const machineMetadata = {
          ...(machine.metadata ?? {}),
          connector_id: id,
        };
        const selfHostMetadata = {
          ...(host.metadata?.self_host ?? {}),
          auto_start_pending: true,
          auto_start_requested_at: new Date().toISOString(),
        };
        const nextMetadata = {
          ...(host.metadata ?? {}),
          machine: { ...machine, metadata: machineMetadata },
          self_host: selfHostMetadata,
        };
        await pool().query(
          `UPDATE project_hosts
           SET region=$2, metadata=$3, updated=NOW()
           WHERE id=$1 AND deleted IS NULL`,
          [hostId, id, nextMetadata],
        );
      };
      if (!connectorId) {
        const { rows: created } = await pool().query<{
          connector_id: string;
        }>(
          `INSERT INTO self_host_connectors
             (connector_id, account_id, host_id, token_hash, name, metadata, created, last_seen, revoked)
           VALUES (gen_random_uuid(), $1, $2, NULL, $3, $4, NOW(), NULL, FALSE)
           RETURNING connector_id`,
          [account_id, hostId, host.name ?? null, host.metadata ?? {}],
        );
        connectorId = created[0]?.connector_id;
        if (!connectorId) {
          res.status(500).send("failed to allocate connector");
          return;
        }
        await attachConnector(connectorId);
      } else {
        const { rows: connectors } = await pool().query<{
          connector_id: string;
          host_id: string | null;
        }>(
          `SELECT connector_id, host_id
             FROM self_host_connectors
            WHERE connector_id=$1 AND revoked IS NOT TRUE`,
          [connectorId],
        );
        const connector = connectors[0];
        if (!connector) {
          const { rows: created } = await pool().query<{
            connector_id: string;
          }>(
            `INSERT INTO self_host_connectors
               (connector_id, account_id, host_id, token_hash, name, metadata, created, last_seen, revoked)
             VALUES (gen_random_uuid(), $1, $2, NULL, $3, $4, NOW(), NULL, FALSE)
             RETURNING connector_id`,
            [account_id, hostId, host.name ?? null, host.metadata ?? {}],
          );
          connectorId = created[0]?.connector_id;
          if (!connectorId) {
            res.status(500).send("failed to allocate connector");
            return;
          }
          await attachConnector(connectorId);
        } else if (connector.host_id && connector.host_id !== hostId) {
          res.status(409).send("connector already assigned to another host");
          return;
        } else if (!connector.host_id) {
          await pool().query(
            `UPDATE self_host_connectors
             SET host_id=$2
             WHERE connector_id=$1`,
            [connector.connector_id, hostId],
          );
          await attachConnector(connector.connector_id);
        }
      }
      const ttlSecondsRaw = req.body?.ttl_seconds;
      const ttlSeconds =
        typeof ttlSecondsRaw === "number" && ttlSecondsRaw > 0
          ? ttlSecondsRaw
          : undefined;
      const tokenInfo = await createPairingToken({
        account_id,
        ttlMs: ttlSeconds ? ttlSeconds * 1000 : undefined,
        connector_id: connectorId,
        host_id: hostId,
      });
      res.json({
        pairing_token: tokenInfo.token,
        expires: tokenInfo.expires,
        connector_id: connectorId,
      });
    } catch (err) {
      logger.warn("pairing token creation failed", err);
      res.status(500).send("pairing token creation failed");
    }
  });

  router.post("/self-host/pair", jsonParser, async (req, res) => {
    try {
      const mode = await ensureOnPrem(res);
      if (!mode) {
        return;
      }
      const pairingToken = String(req.body?.pairing_token ?? "");
      if (!pairingToken) {
        res.status(400).send("missing pairing token");
        return;
      }
      const tokenInfo = await verifyPairingToken(pairingToken);
      if (!tokenInfo) {
        res.status(401).send("invalid pairing token");
        return;
      }
      const connectorInfo = (req.body?.connector_info ?? {}) as Record<
        string,
        any
      >;
      const name = connectorInfo?.name ? String(connectorInfo.name) : undefined;
      let connector_id: string;
      let token: string;
      if (tokenInfo.connector_id) {
        const activated = await activateConnector({
          connector_id: tokenInfo.connector_id,
          account_id: tokenInfo.account_id,
          name,
          metadata: connectorInfo,
        });
        connector_id = activated.connector_id;
        token = activated.token;
      } else {
        const created = await createConnector({
          account_id: tokenInfo.account_id,
          name,
          metadata: connectorInfo,
          host_id: tokenInfo.host_id ?? undefined,
        });
        connector_id = created.connector_id;
        token = created.token;
      }
      await revokePairingToken(tokenInfo.token_id);
      res.json({
        connector_id,
        connector_token: token,
        poll_interval_seconds: 10,
        launchpad: getLaunchpadOnPremConfig(mode),
      });
    } catch (err) {
      logger.warn("pairing failed", err);
      res.status(500).send("pairing failed");
    }
  });

  router.get("/self-host/next", async (req, res) => {
    try {
      if (!(await ensureOnPrem(res))) {
        return;
      }
      const token = extractToken(req);
      if (!token) {
        res.status(401).send("missing connector token");
        return;
      }
      const connector = await verifyConnectorToken(token);
      if (!connector) {
        res.status(401).send("invalid connector token");
        return;
      }
      await maybeAutoStartHost(connector);
      const { rows } = await pool().query(
        `SELECT command_id, action, payload, created
         FROM self_host_commands
         WHERE connector_id=$1
           AND state='pending'
         ORDER BY created ASC
         LIMIT 1`,
        [connector.connector_id],
      );
      const row = rows[0];
      if (!row) {
        res.status(204).send();
        return;
      }
      await pool().query(
        `UPDATE self_host_commands
         SET state='sent', updated=NOW()
         WHERE command_id=$1`,
        [row.command_id],
      );
      res.json({
        id: row.command_id,
        action: row.action,
        payload: row.payload ?? {},
        issued_at: row.created,
      });
    } catch (err) {
      logger.warn("self-host next failed", err);
      res.status(500).send("self-host next failed");
    }
  });

  router.post("/self-host/commands", jsonParser, async (req, res) => {
    try {
      if (!(await ensureOnPrem(res))) {
        return;
      }
      const account_id = await getAccount(req);
      if (!account_id) {
        res.status(401).send("user must be signed in");
        return;
      }
      const connectorId = String(req.body?.connector_id ?? "");
      if (!connectorId) {
        res.status(400).send("missing connector_id");
        return;
      }
      const action = String(req.body?.action ?? "");
      const allowed = new Set(["create", "start", "stop", "delete", "status", "resize"]);
      if (!allowed.has(action)) {
        res.status(400).send("invalid action");
        return;
      }
      const { rows } = await pool().query(
        `SELECT account_id FROM self_host_connectors
         WHERE connector_id=$1 AND revoked IS NOT TRUE`,
        [connectorId],
      );
      const connectorAccount = rows[0]?.account_id;
      if (!connectorAccount) {
        res.status(404).send("connector not found");
        return;
      }
      if (
        connectorAccount !== account_id &&
        !(await isAdmin(account_id))
      ) {
        res.status(403).send("not authorized");
        return;
      }
      const payload = req.body?.payload ?? {};
      const { rows: inserted } = await pool().query(
        `INSERT INTO self_host_commands
           (command_id, connector_id, action, payload, state, created, updated)
         VALUES (gen_random_uuid(), $1, $2, $3, 'pending', NOW(), NOW())
         RETURNING command_id`,
        [connectorId, action, payload],
      );
      res.json({ ok: true, command_id: inserted[0]?.command_id });
    } catch (err) {
      logger.warn("self-host command enqueue failed", err);
      res.status(500).send("self-host command enqueue failed");
    }
  });

  router.post("/self-host/ack", jsonParser, async (req, res) => {
    try {
      if (!(await ensureOnPrem(res))) {
        return;
      }
      const token = extractToken(req);
      if (!token) {
        res.status(401).send("missing connector token");
        return;
      }
      const connector = await verifyConnectorToken(token);
      if (!connector) {
        res.status(401).send("invalid connector token");
        return;
      }
      const commandId = String(req.body?.id ?? "");
      if (!commandId) {
        res.status(400).send("missing command id");
        return;
      }
      const status = String(req.body?.status ?? "ok");
      const result = req.body?.result ?? null;
      const error = req.body?.error ? String(req.body.error) : null;
      const nextState = status === "ok" ? "done" : "error";
      await pool().query(
        `UPDATE self_host_commands
         SET state=$3, result=$4, error=$5, updated=NOW()
         WHERE command_id=$1 AND connector_id=$2`,
        [commandId, connector.connector_id, nextState, result, error],
      );
      res.json({ ok: true });
    } catch (err) {
      logger.warn("self-host ack failed", err);
      res.status(500).send("self-host ack failed");
    }
  });
}
