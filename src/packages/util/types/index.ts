/* Misc types that are used in frontends, backends, etc.
 */

export type { DirectoryListingEntry } from "./directory-listing";

export type { DatastoreConfig } from "./datastore";

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];
