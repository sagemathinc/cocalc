/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback_opts } from "@cocalc/util/async-utils";
import { capitalize } from "@cocalc/util/misc";

import type { PostgreSQL } from "../types";

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

interface ExpectedComputeImage {
  id: string;
  src: string;
  type: string;
  display?: string;
  url?: string;
  desc?: string;
  path: string;
  disabled: boolean;
}

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

function expectedComputeImages(): Map<string, ExpectedComputeImage> {
  let rseed = 123;
  const random = (): number => {
    const x = Math.sin(rseed++);
    return x - Math.floor(x);
  };

  const providers = ["github.com", "gitlab.com", "bitbucket.org"];
  const expected = new Map<string, ExpectedComputeImage>();

  for (let idx = 0; idx <= 20; idx++) {
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

    expected.set(id, {
      id,
      src,
      type: "custom",
      display,
      url,
      desc,
      path,
      disabled: idx === 1,
    });
  }

  return expected;
}

describe("insert_random_compute_images", () => {
  const database: PostgreSQL = db();

  async function insert_random_compute_images_wrapper(): Promise<void> {
    return callback_opts(database.insert_random_compute_images.bind(database))(
      {},
    );
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup(database);
  });

  it("inserts deterministic compute images", async () => {
    await insert_random_compute_images_wrapper();

    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, src, type, display, url, "desc", path, disabled FROM compute_images ORDER BY id',
    );

    const expected = expectedComputeImages();
    expect(rows.length).toBe(expected.size);

    for (const row of rows) {
      const expectedRow = expected.get(row.id);
      expect(expectedRow).toBeDefined();
      if (!expectedRow) {
        continue;
      }
      expect(row.src).toBe(expectedRow.src);
      expect(row.type).toBe(expectedRow.type);
      expect(row.path).toBe(expectedRow.path);
      expect(Boolean(row.disabled)).toBe(expectedRow.disabled);
      expect(row.display ?? null).toBe(expectedRow.display ?? null);
      expect(row.url ?? null).toBe(expectedRow.url ?? null);
      expect(row.desc ?? null).toBe(expectedRow.desc ?? null);
    }
  });

  it("replaces any existing rows", async () => {
    const pool = getPool();
    await pool.query(
      "INSERT INTO compute_images(id, src, type) VALUES ($1, $2, $3)",
      ["manual-image", "https://example.com/src.git", "custom"],
    );

    await insert_random_compute_images_wrapper();

    const { rows } = await pool.query(
      "SELECT COUNT(*) AS count FROM compute_images WHERE id = $1",
      ["manual-image"],
    );
    expect(parseInt(rows[0].count, 10)).toBe(0);
  });
});
