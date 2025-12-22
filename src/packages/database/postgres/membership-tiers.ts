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
    return rows;
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
    const history = previous?.history ?? [];
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
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
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
        project_defaults ?? null,
        llm_limits ?? null,
        features ?? null,
        disabled ?? false,
        notes ?? null,
        nextHistory ?? [],
      ],
    });
    return rows;
  } else {
    throw new Error("don't know what to do with this query");
  }
}
