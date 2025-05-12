/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { merge, sortBy, throttle, uniq, xor } from "lodash";
import { useState } from "react";
import useAsyncEffect from "use-async-effect";

import api from "@cocalc/frontend/client/api";
import { STARRED_FILES } from "@cocalc/util/consts/bookmarks";
import {
  GetStarredBookmarks,
  GetStarredBookmarksPayload,
  SetStarredBookmarks,
} from "@cocalc/util/types/bookmarks";
import {
  FlyoutActiveStarred,
  getFlyoutActiveStarred,
  storeFlyoutState,
} from "./state";

// Additionally to local storage, we back the state of the starred files in the database.
// Errors with the API are ignored, because we primarily rely on local storage.
// The only really important situation to think of are when there is nothing in local storage but in the database,
// or when there is
export function useStarredFilesManager(project_id: string) {
  const [starred, setStarred] = useState<FlyoutActiveStarred>(
    getFlyoutActiveStarred(project_id),
  );

  // once after mounting this, we update the starred bookmarks (which merges with what we have) and then stores it
  useAsyncEffect(async () => {
    await updateStarred();
  }, []);

  function setStarredLS(starred: string[]) {
    setStarred(starred);
    storeFlyoutState(project_id, "active", { starred: starred });
  }

  // TODO: there are also add/remove API endpoints, but for now we stick with set. Hardly worth optimizing.
  function setStarredPath(path: string, starState: boolean) {
    const next = starState
      ? [...starred, path]
      : starred.filter((p) => p !== path);
    setStarredLS(next);
    storeStarred(next);
  }

  async function storeStarred(stars: string[]) {
    try {
      const payload: SetStarredBookmarks = {
        type: STARRED_FILES,
        project_id,
        stars,
      };
      await api("bookmarks/set", payload);
    } catch (err) {
      console.warn(`bookmark: warning -- ${err}`);
    }
  }

  // this is called once, when the flyout/tabs component is mounted
  // throtteled, to usually take 1 sec from opening the panel to loading the stars
  const updateStarred = throttle(
    async () => {
      try {
        const payload: GetStarredBookmarksPayload = {
          type: STARRED_FILES,
          project_id,
        };
        const data: GetStarredBookmarks = await api("bookmarks/get", payload);

        const { type, status } = data;

        if (type !== STARRED_FILES) {
          console.error(
            `flyout/store/starred type must be ${STARRED_FILES} but we got`,
            type,
          );
          return;
        }

        if (status === "success") {
          const { stars } = data;
          if (
            Array.isArray(stars) &&
            stars.every((x) => typeof x === "string")
          ) {
            stars.sort(); // sorted for the xor check below
            const next = sortBy(uniq(merge(starred, stars)));
            setStarredLS(next);
            if (xor(stars, next).length > 0) {
              // if there is a change (e.g. nothing in the database stored yet), store the stars
              await storeStarred(next);
            }
          } else {
            console.error("flyout/store/starred invalid payload", stars);
          }
        } else if (status === "error") {
          const { error } = data;
          console.error("flyout/store/starred error", error);
        } else {
          console.error("flyout/store/starred error: unknown status", status);
        }
      } catch (err) {
        console.warn(`bookmark: warning -- ${err}`);
      }
    },
    1000,
    { trailing: true, leading: false },
  );

  return {
    starred,
    setStarredPath,
  };
}
