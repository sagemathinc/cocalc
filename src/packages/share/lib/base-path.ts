// The basePath, as defined in CoCalc, so "/" is valid, but "" is not.

export const basePath = process.env.BASE_PATH ?? "/share";

// appBasePath = stripping off "/share" from end except when is /share.
// This is the base path of the main application.
export const appBasePath =
  basePath == "/share" ? "/" : basePath.slice(0, basePath.lastIndexOf("/share"));
