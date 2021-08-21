export { useCustomize, CustomizeContext } from "./context";

/* The information that describes the cocalc server.
   This is just a type declaration for documentation purposes and the
   hub does user the server with this (see packages/hub/servers/app/landing.ts).*/

// I tried many ways, and using next.js's process.env support
// seems by far the best approach.  Using process.env ensures that
// you can't change the result once the app is running, which
// makes nextjs happy.

export const CUSTOMIZE = process.env.CUSTOMIZE
  ? JSON.parse(process.env.CUSTOMIZE)
  : { basePath: "/" };

if (CUSTOMIZE.basePath == null) {
  CUSTOMIZE.basePath = "/"; // ensure guarantee of type
}
if (CUSTOMIZE.appBasePath == null) {
  CUSTOMIZE.appBasePath = CUSTOMIZE.basePath;
}
