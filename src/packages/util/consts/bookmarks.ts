// maximum number of stars per bookmark
export const MAX_STARS = 256;
// maximum length of strings in the stars string array
export const MAX_LENGTH_STAR = 2048;
// the type of bookmark for starring files
export const STARRED_FILES = "starred-files";
// all allowed types (right now just one)
export const BOOKMARK_TYPES = [STARRED_FILES] as const;
