export interface DirectoryListingEntry {
  name: string;
  isdir?: boolean;
  issymlink?: boolean;
  // set if issymlink is true and we're able to determine the target of the link
  link_target?: string;
  // bytes for file, number of entries for directory (*including* . and ..).
  size?: number;
  mtime?: number;
  error?: string;
  mask?: boolean;
}
