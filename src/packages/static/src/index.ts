// Return the absolute path to the built static files, so they can be served
// up by some static webserver.

import { resolve, join } from "path";

export const path = resolve(join(__dirname, "..", "..", "dist"));

export { webpackCompiler } from "./webpack-compiler";
