import { OPERATORS, UserOrProjectQuery, isToOperand } from "@cocalc/util/schema";
import { quoteField } from "../postgres/schema/util";

export function queryIsCmp(val): false | string {
  if (typeof val != "object") {
    return false;
  }
  const keys = Object.keys(val);
  if (keys.length != 1) {
    return false;
  }
  if (OPERATORS.includes(keys[0] as any)) {
    return keys[0];
  }
  return false;
}

// Additional where object condition imposed by user's get query
export function userGetQueryFilter(
  user_query: object,
  client_query: UserOrProjectQuery<any>
): { [expr: string]: any } {
  if (client_query.get == null) {
    // no get queries allowed (this is mainly to make typescript happy below.)
    return {};
  }

  // If the schema lists the value in a get query as 'null', then we remove it;
  // nulls means it was only there to be used by the initial where filter
  // part of the query.
  for (const field in client_query.get.fields) {
    const val = client_query.get.fields[field];
    if (val === "null") {
      delete user_query[field];
    }
  }

  const where: { [expr: string]: any } = {};
  for (const field in user_query) {
    const val = user_query[field];
    if (val == null) continue;
    if (
      client_query.get.remove_from_query != null &&
      client_query.get.remove_from_query.includes(field)
    ) {
      // do not include any field that explicitly excluded from the query
      continue;
    }
    if (queryIsCmp(val)) {
      // A comparison, e.g.,
      // field :
      //    '<=' : 5
      //    '>=' : 2
      for (let op in val) {
        const v = val[op];
        if (op === "==") {
          // not in SQL, but natural for our clients to use it
          op = "=";
        }
        if (op.toLowerCase().startsWith("is")) {
          // hack to use same where format for now, since $ replacement
          // doesn't work for "foo IS ...".
          where[`${quoteField(field)} ${op} ${isToOperand(v)}`] = true;
        } else {
          where[`${quoteField(field)} ${op} $`] = v;
        }
      }
    } else {
      where[`${quoteField(field)} = $`] = val;
    }
  }

  return where;
}
