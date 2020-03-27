/*
Information (from the database) about authors of shares,
and what shares were authored by a given account.
*/

import { cmp, endswith, is_valid_uuid_string } from "smc-util/misc2";
import { callback2 } from "smc-util/async-utils";
import { meta_file } from "smc-util/misc";
import { Author } from "smc-webapp/share/types";
import { Database } from "./types";

export class AuthorInfo {
  private database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  public async get_authors(
    project_id: string,
    // path can be a single path or an array of paths;
    // if give a single path, also automatically includes
    // known aux files (this is just for ipynb).
    path: string | string[]
  ): Promise<Author[]> {
    if (!is_valid_uuid_string(project_id)) {
      throw Error(`project_id=${project_id} must be a valid uuid string`);
    }
    // Determine the paths to check in the database:
    const account_ids: string[] = [];
    const known_account_ids: Set<string> = new Set();
    let paths: string[];
    if (typeof path == "string") {
      paths = [path];
      if (endswith(path, ".ipynb")) {
        paths.push(meta_file(path, "jupyter2"));
        paths.push(meta_file(path, "jupyter"));
      }
    } else {
      paths = path;
    }

    // Get accounts that have edited these paths, if they have edited them using sync.
    for (const path of paths) {
      const id: string = this.database.sha1(project_id, path);
      const result = await callback2(this.database._query, {
        query: `SELECT users FROM syncstrings WHERE string_id='${id}'`,
      });
      if (result == null || result.rowCount < 1) continue;
      for (const account_id of result.rows[0].users) {
        if (account_id != project_id && !known_account_ids.has(account_id)) {
          account_ids.push(account_id);
          known_account_ids.add(account_id);
        }
      }
    }

    // If no accounts, use the project collaborators as a fallback.
    if (account_ids.length === 0) {
      const result = await callback2(this.database._query, {
        query: `SELECT jsonb_object_keys(users) FROM projects where project_id='${project_id}'`,
      });
      if (result != null && result.rowCount >= 1) {
        for (const v of result.rows) {
          account_ids.push(v.jsonb_object_keys);
        }
      }
    }

    // Get usernames for the accounts
    const authors: Author[] = [];
    const names = await callback2(this.database.get_usernames, {
      account_ids,
      cache_time_s: 60 * 5,
    });
    for (const account_id in names) {
      // todo really need to sort by last name
      const { first_name, last_name } = names[account_id];
      const name = `${first_name} ${last_name}`;
      authors.push({ name, account_id });
    }

    // Sort by last name
    authors.sort((a, b) =>
      cmp(names[a.account_id].last_name, names[b.account_id].last_name)
    );
    return authors;
  }

  public async get_username(account_id: string): Promise<string> {
    const names = await callback2(this.database.get_usernames, {
      account_ids: [account_id],
      cache_time_s: 60 * 5,
    });
    const { first_name, last_name } = names[account_id];
    return `${first_name} ${last_name}`;
  }

  public async get_shares(account_id: string): Promise<string[]> {
    // Returns the id's of all public paths for which account_id
    // is a collaborator on the project that has actively used the project.
    // It would be more useful
    // to additionally filter using the syncstrings table for documents
    // that account_id actually edited, but that's a lot harder.
    // We sort from most recently saved back.
    if (!is_valid_uuid_string(account_id)) {
      throw Error(`account_id=${account_id} must be a valid uuid string`);
    }
    const query = `select public_paths.id from public_paths, projects where public_paths.project_id = projects.project_id and projects.last_active ? '${account_id}' and (public_paths.unlisted is null or public_paths.unlisted = false) and (public_paths.disabled is null or public_paths.disabled = false) order by public_paths.last_edited desc`;
    const result = await callback2(this.database._query, { query });
    const ids: string[] = [];
    if (result == null) return [];
    for (const x of result.rows) {
      ids.push(x.id);
    }
    return ids;
  }
}
