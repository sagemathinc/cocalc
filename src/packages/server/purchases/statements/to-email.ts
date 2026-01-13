/*

Examples:


statement:
{
  "id": 46,
  "interval": "day",
  "account_id": "d5dc3497-d9f6-4d7d-893e-88274757f553",
  "time": "2023-08-01T00:00:00.000Z",
  "balance": 43.00552,
  "total_charges": 0,
  "num_charges": 0,
  "total_credits": -15,
  "num_credits": 1,
  "last_sent": null
}

purchases:
[
  {
    "id": 479,
    "time": "2023-07-31T03:26:55.156Z",
    "cost": -15,
    "cost_per_hour": null,
    "period_start": null,
    "period_end": null,
    "service": "credit",
    "description": {
      "type": "credit"
    },
    "project_id": null
  }
]
*/

import type { Statement } from "@cocalc/util/db-schema/statements";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import { moneyRound2Down, moneyToCurrency, toDecimal } from "@cocalc/util/money";
import { plural } from "@cocalc/util/misc";
import { QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";

function toISODay(d: any) {
  return new Date(d).toISOString().split("T")[0];
}

export function statementToMarkdown(
  statement: Statement,
  previousStatement: Statement | null,
  opts: { siteName?: string } = {},
): string {
  const { siteName = "CoCalc" } = opts;
  const previousBalance = moneyRound2Down(
    toDecimal(previousStatement?.balance ?? 0),
  );
  const totalCharges = toDecimal(statement.total_charges ?? 0);
  const totalCredits = toDecimal(statement.total_credits ?? 0);
  const balance = toDecimal(statement.balance ?? 0);
  return `
## Your ${statement.interval == "day" ? "Daily" : "Monthly"} ${siteName} Statement (Id = ${statement.id})
- ${toISODay(statement.time)}
- Previous Balance: ${moneyToCurrency(previousBalance)}
- ${statement.num_charges} ${plural(
    statement.num_charges,
    "Charge",
  )}: ${moneyToCurrency(totalCharges.neg())}
- ${statement.num_credits} ${plural(
    statement.num_credits,
    "Credit",
  )}: ${moneyToCurrency(totalCredits.neg())}
- New Balance: ${moneyToCurrency(balance)}
${balance.gte(0) ? "- **NO PAYMENT IS REQUIRED.**" : ""}
`;
}

export function purchasesToMarkdown({
  purchases,
  statement,
}: {
  purchases: Purchase[];
  statement: Statement;
}): string {
  const v: string[] = [];
  v.push("| Id  | Date | Service | Amount | Balance |");
  v.push("| :-- | :--  | :------ | -----: | -----: |");
  let balance = toDecimal(statement.balance ?? 0);
  for (const { id, time, service, cost } of purchases) {
    const amount = cost == null ? null : toDecimal(cost).neg();
    const spec = QUOTA_SPEC[service];
    v.push(
      `| ${id} | ${toISODay(time)} | ${spec?.display ?? service} | ${
        amount == null ? "-" : moneyToCurrency(amount)
      } | ${moneyToCurrency(balance)} |`,
    );
    if (amount != null) {
      balance = balance.sub(amount);
    }
  }

  return `
### Transactions (${purchases.length})

${v.join("\n")}

`;
}
