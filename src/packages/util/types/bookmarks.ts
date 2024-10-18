type GetStarredBookmarksCommon = {
  type: "starred-files";
  project_id: string;
};

export type GetStarredBookmarks = GetStarredBookmarksCommon &
  (
    | {
        status: "success";
        payload: string[];
        last_edited?: number ;
      }
    | {
        status: "error";
        error: string;
      }
  );
