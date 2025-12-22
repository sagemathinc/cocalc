import { callback2 } from "@cocalc/util/async-utils";
import { PostgreSQL } from "./types";

function isDelete(options: { delete?: boolean }[]) {
  return options.some((v) => v?.delete === true);
}

interface Query {
  id: string;
  label?: string;
  store_visible?: boolean;
  priority?: number;
  price_monthly?: number;
  price_yearly?: number;
  project_defaults?;
  llm_limits?;
  features?;
  disabled?: boolean;
  notes?: string;
}

function buildHistoryEntry(row): Record<string, unknown> {
  if (!row) return {};
  const entry = { ...row };
  delete entry.history;
  return entry;
}

function toJsonParam(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(value);
}

export default async function membershipTiersQuery(
  db: PostgreSQL,
  options: { delete?: boolean }[],
  query: Query,
) {
  if (isDelete(options) && query.id) {
    await callback2(db._query, {
      query: "DELETE FROM membership_tiers WHERE id = $1",
      params: [query.id],
    });
    return;
  }

  if (query.id == "*") {
    const { rows } = await callback2(db._query, {
      query: "SELECT * FROM membership_tiers",
    });
    const counts = await callback2(db._query, {
      query: `SELECT metadata->>'class' AS tier_id,
                     COUNT(*)::int AS subscription_count,
                     COUNT(DISTINCT account_id)::int AS account_count
              FROM subscriptions
              WHERE metadata->>'type'='membership'
              GROUP BY tier_id`,
    });
    const byTier = (counts.rows ?? []).reduce((acc, row) => {
      if (!row?.tier_id) return acc;
      acc[row.tier_id] = {
        subscription_count: row.subscription_count ?? 0,
        account_count: row.account_count ?? 0,
      };
      return acc;
    }, {});
    return rows.map((row) => ({
      ...row,
      ...(byTier[row.id] ?? { subscription_count: 0, account_count: 0 }),
    }));
  } else if (query.id) {
    const {
      id,
      label,
      store_visible,
      priority,
      price_monthly,
      price_yearly,
      project_defaults,
      llm_limits,
      features,
      disabled,
      notes,
    } = query;

    const existing = await callback2(db._query, {
      query: "SELECT * FROM membership_tiers WHERE id = $1",
      params: [id],
    });
    const previous = existing.rows?.[0];
    const history = Array.isArray(previous?.history) ? previous.history : [];
    const nextHistory =
      previous == null ? history : [...history, buildHistoryEntry(previous)];

    const { rows } = await callback2(db._query, {
      query: `INSERT INTO membership_tiers (
                "id",
                "label",
                "store_visible",
                "priority",
                "price_monthly",
                "price_yearly",
                "project_defaults",
                "llm_limits",
                "features",
                "disabled",
                "notes",
                "history",
                "created",
                "updated"
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7::JSONB,$8::JSONB,$9::JSONB,$10,$11,$12::JSONB,NOW(),NOW())
              ON CONFLICT (id)
              DO UPDATE SET
                "label" = EXCLUDED.label,
                "store_visible" = EXCLUDED.store_visible,
                "priority" = EXCLUDED.priority,
                "price_monthly" = EXCLUDED.price_monthly,
                "price_yearly" = EXCLUDED.price_yearly,
                "project_defaults" = EXCLUDED.project_defaults,
                "llm_limits" = EXCLUDED.llm_limits,
                "features" = EXCLUDED.features,
                "disabled" = EXCLUDED.disabled,
                "notes" = EXCLUDED.notes,
                "history" = EXCLUDED.history,
                "updated" = NOW()`,
      params: [
        id,
        label ?? null,
        store_visible ?? false,
        priority ?? 0,
        price_monthly ?? null,
        price_yearly ?? null,
        toJsonParam(project_defaults),
        toJsonParam(llm_limits),
        toJsonParam(features),
        disabled ?? false,
        notes ?? null,
        toJsonParam(nextHistory ?? []),
      ],
    });
    return rows;
  } else {
    throw new Error("don't know what to do with this query");
  }
}
