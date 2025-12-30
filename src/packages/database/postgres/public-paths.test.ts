/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback_opts } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";

import type { PostgreSQL, PublicPathListing } from "./types";

describe("public paths methods", () => {
  const database: PostgreSQL = db();

  const getPublicPathsLegacy = callback_opts(
    database.get_public_paths.bind(database),
  ) as (opts: { project_id: string }) => Promise<string[]>;
  const hasPublicPathLegacy = callback_opts(
    database.has_public_path.bind(database),
  ) as (opts: { project_id: string }) => Promise<boolean>;
  const pathIsPublicLegacy = callback_opts(
    database.path_is_public.bind(database),
  ) as (opts: { project_id: string; path: string }) => Promise<boolean>;
  const filterPublicPathsLegacy = callback_opts(
    database.filter_public_paths.bind(database),
  ) as (opts: {
    project_id: string;
    path: string;
    listing: PublicPathListing;
  }) => Promise<PublicPathListing>;

  async function getPublicPaths(opts: {
    project_id: string;
  }): Promise<string[]> {
    return getPublicPathsLegacy(opts);
  }

  async function hasPublicPath(opts: { project_id: string }): Promise<boolean> {
    return hasPublicPathLegacy(opts);
  }

  async function pathIsPublic(opts: {
    project_id: string;
    path: string;
  }): Promise<boolean> {
    return pathIsPublicLegacy(opts);
  }

  async function filterPublicPaths(opts: {
    project_id: string;
    path: string;
    listing: PublicPathListing;
  }): Promise<PublicPathListing> {
    return filterPublicPathsLegacy(opts);
  }

  async function insertProject(project_id: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      "INSERT INTO projects (project_id, title, users, last_edited) VALUES ($1, $2, $3, $4)",
      [project_id, "Test Project", JSON.stringify({}), new Date()],
    );
  }

  async function insertPublicPath(opts: {
    project_id: string;
    path: string;
    disabled?: boolean;
  }): Promise<void> {
    const pool = getPool();
    const now = new Date();
    const id = database.sha1(opts.project_id, opts.path);
    await pool.query(
      "INSERT INTO public_paths (id, project_id, path, disabled, created, last_edited) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, opts.project_id, opts.path, opts.disabled ?? false, now, now],
    );
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterEach(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM public_paths");
    await pool.query("DELETE FROM projects");
  });

  afterAll(async () => {
    await testCleanup(database);
  });

  it("get_public_paths returns only non-disabled paths for the project", async () => {
    const project_id = uuid();
    const other_project_id = uuid();
    await insertProject(project_id);
    await insertProject(other_project_id);

    await insertPublicPath({ project_id, path: "public" });
    await insertPublicPath({ project_id, path: "disabled", disabled: true });
    await insertPublicPath({ project_id: other_project_id, path: "other" });

    const results = await getPublicPaths({ project_id });

    expect(results).toContain("public");
    expect(results).not.toContain("disabled");
    expect(results).not.toContain("other");
  });

  it("has_public_path ignores disabled entries", async () => {
    const project_id = uuid();
    await insertProject(project_id);

    await insertPublicPath({ project_id, path: "disabled", disabled: true });
    expect(await hasPublicPath({ project_id })).toBe(false);

    await insertPublicPath({ project_id, path: "enabled" });
    expect(await hasPublicPath({ project_id })).toBe(true);
  });

  it("path_is_public respects public path containment", async () => {
    const project_id = uuid();
    await insertProject(project_id);
    await insertPublicPath({ project_id, path: "share" });

    expect(await pathIsPublic({ project_id, path: "share" })).toBe(true);
    expect(await pathIsPublic({ project_id, path: "share/file.txt" })).toBe(
      true,
    );
    expect(await pathIsPublic({ project_id, path: "private/file.txt" })).toBe(
      false,
    );
  });

  it("filter_public_paths removes non-public entries when the directory is not public", async () => {
    const project_id = uuid();
    await insertProject(project_id);
    await insertPublicPath({ project_id, path: "pub" });

    const listing: PublicPathListing = {
      files: [{ name: "pub" }, { name: "private" }],
    };

    const result = await filterPublicPaths({
      project_id,
      path: "",
      listing,
    });

    const names = (result.files ?? []).map((entry) => entry.name);
    expect(names).toEqual(["pub"]);
  });

  it("filter_public_paths returns listing unchanged when the directory is public", async () => {
    const project_id = uuid();
    await insertProject(project_id);
    await insertPublicPath({ project_id, path: "pub" });

    const listing: PublicPathListing = {
      files: [{ name: "a.txt" }, { name: "b.txt" }],
    };

    const result = await filterPublicPaths({
      project_id,
      path: "pub",
      listing,
    });

    expect(result).toBe(listing);
  });
});
