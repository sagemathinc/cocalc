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
import { currency, round2down } from "@cocalc/util/misc";
import { plural } from "@cocalc/util/misc";
import { QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";
import { decimalSubtract } from "@cocalc/util/stripe/calc";

function toISODay(d: any) {
  return new Date(d).toISOString().split("T")[0];
}

export function statementToMarkdown(
  statement: Statement,
  previousStatement: Statement | null,
  opts: { siteName?: string } = {},
): string {
  const { siteName = "CoCalc" } = opts;
  return `
## Your ${statement.interval == "day" ? "Daily" : "Monthly"} ${siteName} Statement (Id = ${statement.id})
- ${toISODay(statement.time)}
- Previous Balance: ${currency(round2down(previousStatement?.balance ?? 0))}
- ${statement.num_charges} ${plural(statement.num_charges, "Charge")}: ${currency(
    -statement.total_charges,
  )}
- ${statement.num_credits} ${plural(statement.num_credits, "Credit")}: ${currency(
    -statement.total_credits,
  )}
- New Balance: ${currency(statement.balance)}
${statement.balance >= 0 ? "- **NO PAYMENT IS REQUIRED.**" : ""}
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
  let balance = statement.balance;
  for (const { id, time, service, cost } of purchases) {
    const amount = -(cost ?? 0);
    const spec = QUOTA_SPEC[service];
    v.push(
      `| ${id} | ${toISODay(time)} | ${spec?.display ?? service} | ${amount == null ? "-" : currency(amount)} | ${currency(balance)} |`,
    );
    if (amount != null) {
      balance = decimalSubtract(balance, amount);
    }
  }

  return `
### Transactions (${purchases.length})

${v.join("\n")}

`;
}
