/*
Show an avatar for a given user account.
*/

import { useEffect, useState } from "react";
import apiPost from "lib/api/post";
import { Profile } from "@cocalc/backend/accounts/profile/types";

const DEFAULT_CACHE_S = 30;

interface Props {
  account_id: string;
}

export default function Avatar({ account_id }: Props) {
  const [profile, setProfile] = useState<Profile | undefined>(undefined);

  async function getProfile(): Promise<void> {
    try {
      const { profile } = await apiPost(
        "/accounts/profile",
        { account_id },
        DEFAULT_CACHE_S
      );
      setProfile(profile);
    } catch (err) {
      console.warn("Unable to fetch a profile -- ", err);
    }
  }

  useEffect(() => {
    getProfile();
  }, []);

  console.log(profile);

  return (
    <div
      style={{
        display: "inline-block",
        border: "1px solid white",
        width: "30px",
        height: "30px",
        color: "red",
      }}
    >
      {profile && profile.first_name?.[0]}
    </div>
  );
}
