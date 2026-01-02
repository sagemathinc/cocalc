/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback2 } from "@cocalc/util/async-utils";
import { capitalize } from "@cocalc/util/misc";

import type { InsertRandomComputeImagesOpts, PostgreSQL } from "../types";

const WORDS = [
  "wizard",
  "jupyter",
  "carrot",
  "python",
  "science",
  "gold",
  "eagle",
  "advanced",
  "course",
  "yellow",
  "bioinformatics",
  "R",
  "electric",
  "sheep",
  "theory",
  "math",
  "physics",
  "calculate",
  "primer",
  "DNA",
  "tech",
  "space",
];

function sampleWords(idx = 0, n = 1): string[] {
  const total = WORDS.length;
  const offset = (idx * 997) % total;
  const ret: string[] = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= total; j++) {
      const word = WORDS[(offset + 97 * i + j) % total];
      if (ret.includes(word)) {
        continue;
      }
      ret.push(word);
      break;
    }
  }
  return ret;
}

export async function insert_random_compute_images(
  db: PostgreSQL,
  _opts: InsertRandomComputeImagesOpts,
): Promise<void> {
  const dbg = db._dbg("database::insert_random_compute_images");
  dbg();

  let rseed = 123;
  const random = (): number => {
    const x = Math.sin(rseed++);
    return x - Math.floor(x);
  };

  const providers = ["github.com", "gitlab.com", "bitbucket.org"];

  const create = async (idx: number): Promise<void> => {
    const rnd = sampleWords(idx, 3);
    const id = `${rnd.slice(0, 2).join("-")}-${idx}`;
    const provider = providers[idx % providers.length];
    const src = `https://${provider}/${rnd[2]}/${id}.git`;

    let display: string | undefined;
    if (random() > 0.25) {
      let extra: string | string[];
      if (random() > 0.5) {
        extra = `(${sampleWords(idx + 2)})`;
      } else {
        extra = sampleWords(idx + 5, 2);
      }
      const parts = rnd
        .slice(0, 2)
        .concat(extra as string | string[]) as string[];
      display = parts.map((part) => capitalize(part)).join(" ");
    } else {
      if (random() > 0.5) {
        display = undefined;
      } else {
        display = "";
      }
    }

    let url: string | undefined;
    if (random() > 0.5) {
      url = `https://www.google.com/search?q=${rnd.join("%20")}`;
    }

    let desc: string | undefined;
    if (random() > 0.5) {
      let verylong: string | undefined;
      if (random() > 0.5) {
        verylong = Array(100)
          .fill("very long *text* for **testing**, ")
          .join(" ");
      }
      const other_page =
        url != null ? `, or point to [yet another page](${url})` : "";
      desc = `This is some text describing what **${display || id}** is.
Here could also be an [external link](https://doc.cocalc.com).
It might also mention \`${id}\`${other_page}.

${verylong ?? ""}`;
    }

    const path = random() > 0.5 ? "index.ipynb" : "subdir/";
    random() > 0.25;

    await callback2(db._query.bind(db), {
      query: "INSERT INTO compute_images",
      values: {
        "id      :: TEXT     ": id,
        "src     :: TEXT     ": src,
        "type    :: TEXT     ": "custom",
        "desc    :: TEXT     ": desc,
        "display :: TEXT     ": display,
        "path    :: TEXT     ": path,
        "url     :: TEXT     ": url,
        "disabled:: BOOLEAN  ": idx === 1,
      },
    });
  };

  await callback2(db._query.bind(db), {
    query: "DELETE FROM compute_images",
    where: "1 = 1",
  });

  for (let idx = 0; idx <= 20; idx++) {
    await create(idx);
  }
}
