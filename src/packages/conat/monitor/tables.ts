/*
Displaying ASCII art tables in the terminal to understand Conat state.

We will also have similar functionality in the web app. Both are a good idea to
have for various reasons.


*/

import { AsciiTable3 } from "@cocalc/ascii-table3";
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

interface Options {
  client: Client;
  maxWait?: number;
  maxMessages?: number;
}

// cd packages/backend; pnpm conat-connections
export async function usage({ client, maxWait = 3000, maxMessages }: Options) {
  const sys = client.callMany("sys.conat.server", { maxWait, maxMessages });
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

  table.setStyle("unicode-round");
  return table;
}

export async function stats({ client, maxWait = 3000, maxMessages }: Options) {
  const sys = client.callMany("sys.conat.server", { maxWait, maxMessages });
  const data = await sys.stats();

  const rows: any[] = [];
  const cols = 8;
  const totals = Array(cols).fill(0);
  for await (const X of data) {
    for (const server in X) {
      const stats = X[server];
      for (const id in stats) {
        const x = stats[id];
        let user;
        if (x.user?.error) {
          user = user.error;
        } else {
          user = JSON.stringify(x.user).slice(1, -1);
        }
        const uptime = formatCompactDuration(Date.now() - x.connected);
        rows.push([
          id,
          user,
          server,
          x.address,
          uptime,
          x.send.messages,
          human_readable_size(x.send.bytes),
          x.subs,
        ]);
        totals[cols - 3] += x.send.messages;
        totals[cols - 2] += x.send.bytes;
        totals[cols - 1] += x.subs;
      }
    }
  }
  rows.sort(field_cmp(`${cols - 1}`));
  rows.push(Array(cols).fill(""));
  rows.push([
    "TOTALS",
    `Total for ${rows.length - 1} connections:`,
    ...Array(cols - 5).fill(""),
    totals[cols - 3],
    human_readable_size(totals[cols - 2]),
    totals[cols - 1],
  ]);

  const table = new AsciiTable3(`${rows.length - 2} Conat Connections`)
    .setHeading(
      "ID",
      "User",
      "Server",
      "Address",
      "Uptime",
      "Out Msgs",
      "Out Bytes",
      "Subs",
    )
    .addRowMatrix(rows);

  table.setStyle("unicode-round");
  return table;
}

export async function showUsersAndStats({
  client,
  maxWait = 3000,
  maxMessages,
}: Options) {
  let s;
  if (maxMessages) {
    s = `for up ${maxMessages} servers `;
  } else {
    s = "";
  }
  console.log(`Gather data ${s}for up to ${maxWait / 1000} seconds...\n\n`);
  const X = [usage, stats];
  const tables: any[] = [];
  const f = async (i) => {
    tables.push(await X[i]({ client, maxWait, maxMessages }));
  };
  await Promise.all([f(0), f(1)]);
  console.log(tables[0].toString());
  console.log(tables[1].toString());
}
