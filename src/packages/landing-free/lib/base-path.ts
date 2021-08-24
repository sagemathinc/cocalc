// The basePath, as defined in CoCalc, so "/" is valid, but "" is not.

export const basePath = process.env.BASE_PATH ?? "/";
export const appBasePath = basePath;
