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
    "pending": null,
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
import { currency } from "@cocalc/util/misc";
import { plural } from "@cocalc/util/misc";
import { QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";
import { getAmountStyle } from "@cocalc/util/db-schema/purchases";

const STYLE = "padding: 10px 15px;";
const TD = `style="${STYLE}"`;
const WIDTH = "676px";

export function statementToHtml(
  statement: Statement,
  previousStatement: Statement | null,
  opts: { siteName?: string } = {}
): string {
  const { siteName = "CoCalc" } = opts;
  return `
<h3>Your ${
    statement.interval == "day" ? "Daily" : "Monthly"
  } ${siteName} Statement</h3>
<div style='border: 2px solid lightgrey; border-radius:5px; width:${WIDTH}'>
<table style='border-collapse: collapse; width:${WIDTH}'>
<tr><td ${TD}>Statement Id</td><td style='text-align:center; ${STYLE}'>${
    statement.id
  }</td></tr>
<tr><td ${TD}>Date</td><td style='text-align:center; ${STYLE}'>${new Date(
    statement.time
  ).toDateString()}</td></tr>
<tr><td ${TD}>Previous Statement Balance</td><td style='font-family: monospace;text-align:center; ${STYLE}; color:${
    getAmountStyle(previousStatement?.balance ?? 0).color
  }'>${currency(previousStatement?.balance ?? 0)}</td></tr>
<tr><td ${TD}>${statement.num_charges} ${plural(
    statement.num_charges,
    "Charge"
  )} </td><td style='font-family: monospace;text-align:center; ${STYLE}; color:${
    getAmountStyle(-1).color
  }'>${currency(-statement.total_charges)}</td></tr>
<tr><td ${TD}>${statement.num_credits} ${plural(
    statement.num_credits,
    "Credit"
  )} </td><td style='font-family: monospace;text-align:center; ${STYLE}; color:${
    getAmountStyle(1).color
  }'>${currency(-statement.total_credits)}</td></tr>
<tr style='border:2px solid green'><td ${TD}>Your New Statement Balance</td><td style='font-family: monospace;text-align:center; ${STYLE}; font-size:18px'>${currency(
    statement.balance
  )}</td></tr>
</table>
</div>
`;
}

export function statementToText(
  statement: Statement,
  previousStatement: Statement | null,
  opts: { siteName?: string } = {}
): string {
  const { siteName = "CoCalc" } = opts;
  return `
Your ${statement.interval == "day" ? "Daily" : "Monthly"} ${siteName} Statement
Id: ${statement.id}
Date: ${new Date(statement.time).toDateString()}
Previous Statement Balance: ${currency(statement.balance)}
${statement.num_charges} ${plural(statement.num_charges, "Charge")}: ${currency(
    -statement.total_charges
  )}
${statement.num_credits} ${plural(statement.num_credits, "Credit")}: ${currency(
    -statement.total_credits
  )}
New Statement Balance: ${currency(previousStatement?.balance ?? 0)}
`;
}

export function purchasesToHtml(purchases: Purchase[]): string {
  const v: string[] = [];
  let n = 0;
  for (const { id, description, time, service, cost } of purchases) {
    const amount = -(cost ?? 0);
    const spec = QUOTA_SPEC[service];
    v.push(
      `<tr ${
        n % 2 == 0 ? 'style="background:#f8f8f8"' : ""
      }><td ${TD}>${id}</td><td ${TD}>${new Date(
        time
      ).toLocaleString()}</td><td style='text-align:center; ${STYLE}'>${
        spec?.display ?? service
      }</td><td style='font-family: monospace;text-align:right; ${STYLE};  color:${
        getAmountStyle(amount).color
      }'>${
        amount == null ? "-" : currency(amount)
      }</td><td ${TD}><pre style="overflow-y:auto; height:80px;border:1px solid lightgrey;border-radius: 4px; background: white; color: #666;">${JSON.stringify(
        description,
        undefined,
        2
      )}</pre></td></tr>`
    );
    n += 1;
  }

  return `
<h3>Individual Transactions (${purchases.length})</h3>
<div style='border: 2px solid lightgrey; border-radius:5px; width:${WIDTH}; overflow-x: scroll'>
<table style='border-collapse: collapse; width:${WIDTH}'>
<tr>
<th ${TD}>Transaction Id</th>
<th ${TD}>Time (UTC)</th>
<th ${TD}>Service</th>
<th ${TD}>Amount (USD)</th>
<th ${TD}>Description</th>
</tr>
${v.join("\n")}
</table>
</div>
`;
}

export function purchasesToText(purchases: Purchase[]): string {
  const v: string[] = [];
  for (const { id, description, time, service, cost } of purchases) {
    v.push(
      `${id}: ${new Date(time).toLocaleString()}, ${service}, ${
        cost == null ? "-" : currency(cost)
      }, ${JSON.stringify(description)}`
    );
  }

  return `
Individual Transactions (${purchases.length})

${v.join("\n\n")}
`;
}
