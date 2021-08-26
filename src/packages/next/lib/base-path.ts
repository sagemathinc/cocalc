// The basePath, as defined in CoCalc, so "/" is valid, but "" is not.
// Note that in nextjs itself they define "" as a valid basePath, but not "/".
// This is not part of customize, since it can't be changed at runtime
// via the database.

export const basePath = process.env.BASE_PATH ?? "/";
export const appBasePath = basePath;
