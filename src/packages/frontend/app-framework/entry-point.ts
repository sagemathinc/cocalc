type EntryPoint =
  | "next" // the next frontend app from @cocalc/next
  | "app" // the full normal frontend app, loaded from the main website
  | "embed" // an embedded version of the app, e.g., kiosk mode
  | "compute"; // cocalc loaded from the compute server

let entryPoint: EntryPoint = "next";
export { entryPoint };

// called only from the entry points themselves.  I wish I could all this
// stuff using rspack, but I couldn't figure out how.
export function setEntryPoint(x): void {
  entryPoint = x;
}
