/*
Displaying ASCII art tables in the terminal to understand Conat state.

We will also have similar functionality in the web app. Both are a good idea to
have for various reasons.


*/

import { AsciiTable3 } from "ascii-table3";
import { type Client } from "@cocalc/conat/core/client";
import { field_cmp, human_readable_size } from "@cocalc/util/misc";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

dayjs.extend(duration);

function formatCompactDuration(ms: number): string {
  const d = dayjs.duration(ms);

  const hours = d.hours();
  const minutes = d.minutes();
  const seconds = d.seconds();

  let out = "";
  if (d.asDays() >= 1) out += `${Math.floor(d.asDays())}d`;
  if (d.asHours() % 24 >= 1) out += `${hours}h`;
  if (d.asMinutes() % 60 >= 1) out += `${minutes}m`;
  out += `${seconds}s`;
  return out;
}

// cd packages/backend; pnpm conat-connections
export async function usage(client: Client, maxWait = 3000) {
  const sys = client.callMany("sys.conat.server", { maxWait });
  const data = await sys.usage();
  const rows: any[] = [];
  let total = 0;
  for await (const X of data) {
    for (const server in X) {
      const { perUser, total: total0 } = X[server];
      total += total0;

      for (const user in perUser) {
        rows.push([server, user, perUser[user]]);
      }
    }
  }
  rows.sort(field_cmp("2"));
  rows.push(["", "", ""]);
  rows.push(["TOTAL", "", total]);

  const table = new AsciiTable3(`${total} Connections`)
    .setHeading("Server", "User", "Connections")
    .addRowMatrix(rows);

  table.setStyle("unicode-single");
  return table;
}

export async function connections(client: Client, maxWait = 3000) {
  const sys = client.callMany("sys.conat.server", { maxWait });
  const data = await sys.stats();

  const rows: any[] = [];
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for await (const X of data) {
    for (const server in X) {
      const stats = X[server];
      for (const id in stats) {
        const x = stats[id];
        const user = JSON.stringify(x.user).slice(1, -1);
        const uptime = formatCompactDuration(Date.now() - x.connected);
        rows.push([
          id,
          user,
          server,
          uptime,
          x.send.messages,
          human_readable_size(x.send.bytes),
          x.subs,
        ]);
        totals[4] += x.send.messages;
        totals[5] += x.send.bytes;
        totals[6] += x.subs;
      }
    }
  }
  rows.sort(field_cmp("6"));
  rows.push(["", "", "", "", "", "", ""]);
  rows.push([
    "TOTALS",
    `Total for ${rows.length - 1} connections:`,
    "",
    "",
    totals[3],
    human_readable_size(totals[4]),
    totals[5],
  ]);

  const table = new AsciiTable3(`${rows.length - 2} Conat Connections`)
    .setHeading(
      "ID",
      "User",
      "Server",
      "Uptime",
      "Out Msgs",
      "Out Bytes",
      "Subs",
    )
    .addRowMatrix(rows);

  table.setStyle("unicode-single");
  return table;
}

export async function showUsersAndConnections(client: Client, maxWait = 3000) {
  console.log(`Gathering stats for ${maxWait / 1000} seconds...\n\n`);
  const X = [usage, connections];
  const tables: any[] = [];
  const f = async (i) => {
    tables.push(await X[i](client, maxWait));
  };
  await Promise.all([f(0), f(1)]);
  console.log(tables[0].toString());
  console.log(tables[1].toString());
}
