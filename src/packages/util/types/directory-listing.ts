export interface DirectoryListingEntry {
  // relative path (to containing directory)
  name: string;
  // number of *bytes* used to store this path.
  size: number;
  // last modification time in ms of this file
  mtime: number;
  // true if it is a directory
  isDir?: boolean;
  // true if it is a symlink
  isSymLink?: boolean;
  // set if issymlink is true and we're able to determine the target of the link
  linkTarget?: string;
  error?: string;
}
