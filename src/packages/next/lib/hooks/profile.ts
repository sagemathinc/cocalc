/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Hook that uses API to get a given user's profile.
//
// If account_id is explicitly given, returns the *public* profile for that users.
//
// If account_id is NOT given, returns the *private* profile for the signed in user, or
// empty object if user not signed in.

import LRU from "lru-cache";
import { useEffect, useState } from "react";

import { Profile } from "@cocalc/server/accounts/profile/types";
import { len } from "@cocalc/util/misc";
import apiPost from "lib/api/post";
import useIsMounted from "./mounted";

// How often to check for new profile.
const DEFAULT_CACHE_S = 10;

// This cache is to avoid flicker when navigating around, since
// we want to show the last known avatar for a given user before
// checking if there is a new one.
const cache = new LRU<string, Profile>({ max: 300 });

interface Options {
  noCache?: boolean;
  account_id?: string;
}

export default function useProfile(opts: Options = {}): Profile | undefined {
  const { profile } = useProfileWithReload(opts);
  return profile;
}

export function useProfileWithReload(opts: Options = {}): {
  profile: Profile | undefined;
  reload: () => void;
} {
  const { account_id, noCache } = opts;
  const isMounted = useIsMounted();
  const [profile, setProfile] = useState<Profile | undefined>(
    noCache ? undefined : cache.get(account_id ?? "")
  );

  async function getProfile(): Promise<void> {
    try {
      const { profile } = await apiPost(
        "/accounts/profile",
        { account_id, noCache },
        DEFAULT_CACHE_S
      );
      if (!isMounted.current) return;
      setProfile(profile);
      if (!noCache && len(profile) > 0) {
        // only cache if got actual information.
        cache.set(account_id ?? "", profile);
      }
    } catch (err) {
      console.warn("Unable to fetch a profile -- ", err);
    }
  }

  useEffect(() => {
    getProfile();
  }, [account_id, noCache]);

  return { profile, reload: getProfile };
}
