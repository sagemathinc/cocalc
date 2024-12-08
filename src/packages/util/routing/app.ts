// All top level page "entry points" in the webapp must be listed here.
// Should be consistent with and/or used in places like:
//   - @cocalc/frontend/history.ts
//   - @cocalc/frontend/app/actions.ts
//   - @cocalc/hub/servers/app/app-redirect.ts

export const APP_ROUTES = new Set([
  "admin",
  "projects",
  "settings",
  "notifications",
]);
