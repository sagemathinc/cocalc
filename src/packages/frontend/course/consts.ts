// All copy operations (e.g., assigning, collecting, etc.) is set to timeout after this long.
// Also in the UI displaying that a copy is ongoing also times out after this long, e.g, if
// the user refreshes their browser and nothing is going to update things again.
// TODO: make this a configurable parameter, e.g., maybe users have very large assignments
// or things are very slow.
export const COPY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes, for now -- starting project can take time.
