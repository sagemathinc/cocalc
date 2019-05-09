function create_log(name, logger) {
  if (logger != null) {
    return (...m) => logger.debug(`analytics.${name}: `, ...m);
  } else {
    return () => {};
  }
}

// base64 encoded PNG (white), 1x1 pixels
export const png_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

export function analytics_rec(db, logger, token, data): void {
  const dbg = create_log("main", logger);
  dbg(token, data);
  db._query({
    query: "INSERT INTO analytics",
    values: {
      "token::UUID": opts.name,
      "data::TEXT": data
    },
    conflict: "token"
  });
}
