import { PostgreSQL } from "../types";
import { search_split } from "smc-util/misc";

export async function matching_site_licenses(
  db: PostgreSQL,
  search: string,
  limit: number = 5
): Promise<object[]> {
  const where: any[] = [];
  const params: (string | number)[] = [];
  let i = 1;
  for (const s of search_split(search.toLowerCase())) {
    where.push(
      `(lower(title) LIKE $${i}::TEXT OR lower(description) LIKE $${i}::TEXT OR id::TEXT LIKE $${i}::TEXT OR lower(info::TEXT) LIKE $${i}::TEXT )`
    );
    params.push(`%${s}%`);
    i += 1;
  }
  let query = "SELECT * FROM site_licenses";
  query += ` WHERE (${where.join(" AND ")})`;
  // recently active licenses are much more relevant than old ones
  query += " ORDER BY last_used DESC NULLS LAST";
  query += ` LIMIT $${i}::INTEGER`;
  params.push(limit);
  i += 1;

  return (await db.async_query({ query, params })).rows;
}
