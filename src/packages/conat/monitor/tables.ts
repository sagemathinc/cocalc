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

export async function usage(client: Client) {
  const sys = client.call("sys");
  const { perUser, total } = await sys.usage();

  const rows: any[] = [];
  for (const user in perUser) {
    rows.push([user, perUser[user]]);
  }
  rows.sort(field_cmp("1"));
  rows.push(["", ""]);
  rows.push(["TOTALS", total]);

  const table = new AsciiTable3(`${total} Connections`)
    .setHeading("User", "Connections")
    .addRowMatrix(rows);

  table.setStyle("unicode-single");
  console.log(table.toString());
}

export async function connections(client: Client) {
  const sys = client.call("sys");
  const stats = await sys.stats();

  const rows: any[] = [];
  const totals = [0, 0, 0, 0, 0, 0];
  for (const id in stats) {
    const x = stats[id];
    const user = JSON.stringify(x.user).slice(1, -1);
    const uptime = formatCompactDuration(Date.now() - x.connected);
    rows.push([
      id,
      user,
      uptime,
      x.send.messages,
      human_readable_size(x.send.bytes),
      x.subs,
    ]);
    totals[3] += x.send.messages;
    totals[4] += x.send.bytes;
    totals[5] += x.subs;
  }
  rows.sort(field_cmp("5"));
  rows.push(["", "", "", "", "", ""]);
  rows.push([
    "TOTALS",
    `Total for ${rows.length - 1} connections:`,
    "",
    totals[3],
    human_readable_size(totals[4]),
    totals[5],
  ]);

  const table = new AsciiTable3(`${rows.length - 2} Conat Connections`)
    .setHeading("ID", "User", "Uptime", "Out Msgs", "Out Bytes", "Subs")
    .addRowMatrix(rows);

  table.setStyle("unicode-single");
  console.log(table.toString());
}
