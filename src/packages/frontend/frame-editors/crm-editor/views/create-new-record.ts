import set from "../querydb/set";
import { getFieldSpec, getRenderSpec } from "../fields";
import { AtomicSearch } from "../syncdb/use-search";
import { replace_all } from "@cocalc/util/misc";
import { search_split } from "@cocalc/util/misc";

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
}): Promise<void> {
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
        await set({ [dbtable]: x });
        return;
      } catch (_) {}
    }
  }

  await set({ [dbtable]: x });
}

// operators are in packages/util/db-schema/operators.ts
function fillInAtomicSearch(
  x,
  dbtable,
  { field, operator, value }: AtomicSearch
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
