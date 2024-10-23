import { STARRED_FILES } from "../consts/bookmarks";

type GetStarredBookmarksCommon = {
  type: typeof STARRED_FILES;
  project_id: string;
};

export type GetStarredBookmarks = GetStarredBookmarksCommon &
  (
    | {
        status: "success";
        stars: string[];
        last_edited?: number;
      }
    | {
        status: "error";
        error: string;
      }
  );

export type GetStarredBookmarksPayload = {
  type: typeof STARRED_FILES;
  project_id: string;
};

export type SetStarredBookmarks = {
  type: typeof STARRED_FILES;
  project_id: string;
  stars: string[];
};
