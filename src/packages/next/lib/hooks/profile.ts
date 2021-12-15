import { useEffect, useState } from "react";
import { Profile } from "@cocalc/server/accounts/profile/types";
import LRU from "lru-cache";
import apiPost from "lib/api/post";
// How often to check for new avatars.
const DEFAULT_CACHE_S = 30;

// This cache is to avoid flicker when navigating around, since
// we want to show the last known avatar for a given user before
// checking if there is a new one.
const cache = new LRU<string, Profile>({ max: 300 });

export default function useProfile(account_id?: string): Profile | undefined {
  const [profile, setProfile] = useState<Profile | undefined>(
    account_id != null ? cache.get(account_id) : undefined
  );

  async function getProfile(): Promise<void> {
    if (account_id == null) {
      setProfile(undefined);
    }
    try {
      const { profile } = await apiPost(
        "/accounts/profile",
        { account_id },
        DEFAULT_CACHE_S
      );
      console.log("profile = ", profile);
      setProfile(profile);
      cache.set(account_id, profile);
    } catch (err) {
      console.warn("Unable to fetch a profile -- ", err);
    }
  }

  useEffect(() => {
    getProfile();
  }, [account_id]);

  return profile;
}
