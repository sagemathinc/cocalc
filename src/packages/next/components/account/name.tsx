import { CSSProperties } from "react";
import useProfile from "lib/hooks/profile";
import { trunc } from "lib/share/util";

interface Props {
  account_id: string;
  style?: CSSProperties;
}

export default function Name({ account_id, style }: Props) {
  const profile = useProfile(account_id);
  if (profile == null) {
    return <></>;
  }
  const { first_name, last_name } = profile;
  return <span style={style}>{trunc(`${first_name} ${last_name}`, 50)}</span>;
}
