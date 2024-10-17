/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useState } from "react";
import useAsyncEffect from "use-async-effect";

import api from "@cocalc/frontend/client/api";
import { STARRED } from "@cocalc/util/consts/bookmarks";
import {
  FlyoutActiveStarred,
  getFlyoutActiveStarred,
  storeFlyoutState,
} from "./state";
import { merge, sortBy, xor } from "lodash";

// Additionally to local storage, we back the state of the starred files in the database.
export function useStarredFilesManager(project_id: string) {
  const [starred, setStarred] = useState<FlyoutActiveStarred>(
    getFlyoutActiveStarred(project_id),
  );

  // once after mounting this, we update the starred bookmarks (which merges with what we have) and then stores it
  useAsyncEffect(async () => {
    await updateStarred();
    storeStarred(starred);
  }, []);

  function setStarredPath(path: string, starState: boolean) {
    const newStarred = starState
      ? [...starred, path]
      : starred.filter((p) => p !== path);
    setStarred(newStarred);
    storeFlyoutState(project_id, "active", { starred: newStarred });
    storeStarred(newStarred);
  }

  async function storeStarred(starred: string[]) {
    try {
      const next = await api("bookmarks/set", {
        type: STARRED,
        project_id,
        payload: starred,
      });
      console.log("storeStarred", next);
    } catch (err) {
      console.error("api error", err);
    }
  }

  async function updateStarred() {
    try {
      const { status, payload, type, message } = await api("bookmarks/get", {
        type: STARRED,
        project_id,
      });
      if (type !== STARRED) {
        console.error(
          `flyout/store/starred type must be ${STARRED} but we got`,
          type,
        );
        return;
      }
      switch (status) {
        case "success": {
          if (
            Array.isArray(payload) &&
            payload.every((x) => typeof x === "string")
          ) {
            const diff = xor(sortBy(starred), sortBy(payload)).length > 0;
            const next = merge(starred, payload);
            setStarred(next);
            if (diff) {
              // if there is a change (e.g. nothing in the database stored yet), store the stars
              await storeStarred(next);
            }
          } else {
            console.error("flyout/store/starred invalid payload", payload);
          }
        }
        case "error": {
          console.error("flyout/store/starred error", message);
        }
      }
    } catch (err) {
      console.error("api error", err);
    }
  }

  return {
    starred,
    setStarredPath,
  };
}
