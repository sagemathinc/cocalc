interface TypeInfo {
  pg_type?: string;
  type?: string;
}

// Convert from info in the schema table to a pg type
// See https://www.postgresql.org/docs/devel/static/datatype.html
// The returned type from this function is upper case!
export function pgType(info: TypeInfo): string {
  if (info == null || typeof info === "boolean") {
    throw Error(
      `pgType: insufficient information to determine type (info=${JSON.stringify(
        info
      )})`
    );
  }
  if (info.pg_type) {
    return info.pg_type;
  }
  if (!info.type) {
    throw Error(
      "pg_type: insufficient information to determine type (pg_type and type fields both empty)"
    );
  }
  const type = info.type.toLowerCase();
  switch (type) {
    case "uuid":
      return "UUID";
    case "timestamp":
      return "TIMESTAMP";
    case "date":
      return "DATE";
    case "string":
    case "text":
      return "TEXT";
    case "boolean":
      return "BOOLEAN";
    case "map":
      return "JSONB";
    case "integer":
      return "INTEGER";
    case "number":
      return "DOUBLE PRECISION";
    case "array":
      throw Error(
        `pg_type: you must specify the array type explicitly (type=${type})`
      );
    case "buffer":
      return "BYTEA";
    default:
      throw Error(`pgType: unknown type '${type}'`);
  }
}
