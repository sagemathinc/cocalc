/*
Create a new record, attempting to have it be visible in the current view
via heuristics.  We do not at all *depend* on the record actually being
visible; it's just possibly nice.

TODO: this is just a first pass and there's obviously many more things to add,
e.g., related to hashtags, etc.

TODO: We have to write horrible ugly code for figuring out what we created
since the backend currently has no functionality for telling us what
record it creates.  See the comment in user_set_query in postgres-user-queries.
This will just take some nontrivial work to write.
*/

import set from "../querydb/set";
import { getFieldSpec, getRenderSpec } from "../fields";
import { AtomicSearch } from "../syncdb/use-search";
import { replace_all } from "@cocalc/util/misc";
import { search_split } from "@cocalc/util/misc";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export default async function createNewRecord({
  filter,
  search,
  dbtable,
  fields,
  hiddenFields,
}: {
  filter: string;
  search: AtomicSearch[];
  dbtable: string;
  fields: string[];
  hiddenFields: Set<string>;
}): Promise<number | null> {
  // If possible we return the sequential integer id of the created record.
  // The crm_* tables *all* have a sequential integer id
  // as primary key and have a timestamp field called "created".
  const x: any = {};

  if (filter) {
    fillInFilter(x, filter, dbtable, fields, hiddenFields);
  }

  for (const atomicSearch of search) {
    fillInAtomicSearch(x, dbtable, atomicSearch);
  }

  if (dbtable == "crm_tags") {
    let name = x.name ?? "New Tag";
    for (let i = 0; i < 20; i++) {
      x.name = i == 0 ? name : `${name} (${i})`;
      try {
        return await create(dbtable, x);
      } catch (_) {}
    }
  }

  return await create(dbtable, x);
}

async function create(dbtable, obj): Promise<number | null> {
  await set({ [dbtable]: obj });
  // success; now try to figure out id of what we just created.
  // We grab the most recently created record in this table, which
  // is likely to be ours.
  // TODO: this is fine until we do this properly since probably it's
  // just one admin manually using this.
  const result = await webapp_client.async_query({
    query: {
      [dbtable]: [
        {
          id: null,
          created: { ">=": { relative_time: -15, unit: "seconds" } },
        },
      ],
    },
    options: [{ order_by: "-created" }],
  });
  const recent = result.query[dbtable];
  return recent[0].id;
}

// operators are in packages/util/db-schema/operators.ts
function fillInAtomicSearch(
  x,
  dbtable,
  { field, operator, value }: AtomicSearch,
) {
  if (!field || !operator || value === undefined) {
    // only partially input so not being used.  (TODO?)
    return;
  }

  const spec = getRenderSpec(getFieldSpec(dbtable, field));
  if (!spec["editable"]) {
    // obviously don't set a non-editable field
    return;
  }

  if (spec.type != "text" && spec.type != "markdown") {
    // be very conservative -- only edit these types.
    return;
  }

  if (operator == "!=" || operator == "<>") {
    return;
  }
  if (operator == "==" || operator == "=") {
    x[field] = value;
    return;
  }
  if (operator == "LIKE" || operator == "ILIKE") {
    x[field] = replace_all(value, "%", "");
  }
  // TODO: < and >?
}

function fillInFilter(x, filter, dbtable, fields, hiddenFields) {
  filter = filter?.trim().toLowerCase();
  if (!filter) {
    // nothing to do...
    return;
  }
  const terms = search_split(filter);
  for (const field of fields) {
    if (hiddenFields.has(field)) continue;
    const spec = getRenderSpec(getFieldSpec(dbtable, field));
    if (!spec["editable"]) continue;
    if (spec.type == "text" || spec.type == "markdown") {
      x[field] = "";
      for (const term of terms) {
        if (typeof term != "string") {
          // regexp -- no clue how to manufacture match; game over.
          continue;
        }
        if (term.startsWith("-")) {
          // negation.
          continue;
        }
        x[field] += " " + term;
      }
      x[field].trim();
      return;
    }
  }
}
