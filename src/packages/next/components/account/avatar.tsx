/*
Show an avatar for a given user account.
*/

import { Avatar as AntdAvatar } from "antd";
import { CSSProperties, useEffect, useState } from "react";
import apiPost from "lib/api/post";
import { Profile } from "@cocalc/backend/accounts/profile/types";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import LRU from "lru-cache";

// This cache is to avoid flicker when navigating around, since
// we want to show the last known avatar for a given user before
// checking if there is a new one.
const cache = new LRU<string, object>({ max: 300 });

// How often to check for new avatars.
const DEFAULT_CACHE_S = 30;

interface Props {
  account_id: string;
  size?: number;
  style?: CSSProperties;
}

export default function Avatar({ account_id, size, style }: Props) {
  if (size == null) {
    // Default size=40 to match the cocalc logo.
    size = 40;
  }
  const [profile, setProfile] = useState<Profile | undefined>(
    cache.get(account_id)
  );

  async function getProfile(): Promise<void> {
    try {
      const { profile } = await apiPost(
        "/accounts/profile",
        { account_id },
        DEFAULT_CACHE_S
      );
      setProfile(profile);
      cache.set(account_id, profile);
    } catch (err) {
      console.warn("Unable to fetch a profile -- ", err);
    }
  }

  useEffect(() => {
    getProfile();
  }, []);

  if (!profile) {
    // not loaded yet
    return (
      <AntdAvatar
        style={{
          verticalAlign: "middle",
          ...style,
        }}
        size={size}
      ></AntdAvatar>
    );
  }

  if (profile.image) {
    return (
      <AntdAvatar
        style={{
          verticalAlign: "middle",
          ...style,
        }}
        size={size}
        src={<img src={profile.image} />}
      />
    );
  }

  let fontSize: string | undefined = undefined;
  if (size != null) {
    if (size >= 32) {
      fontSize = `${0.75 * size}px`;
    } else if (size >= 24) {
      fontSize = "16pt";
    }
  }

  return (
    <AntdAvatar
      style={{
        backgroundColor: profile.color,
        verticalAlign: "middle",
        fontSize,
        color: avatar_fontcolor(profile.color),
        ...style,
      }}
      size={size}
    >
      {profile.first_name?.[0]}
    </AntdAvatar>
  );
}
