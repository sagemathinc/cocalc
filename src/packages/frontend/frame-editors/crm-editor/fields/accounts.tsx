import { ReactNode } from "react";
import { register } from "./register";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";

register({ type: "accounts" }, ({ field, obj }) => {
  const account_ids = obj[field];
  if (!account_ids) return null;
  const v: ReactNode[] = [];
  for (const account_id of account_ids) {
    v.push(<Avatar key={account_id} account_id={account_id} />);
  }
  return <div>{v}</div>;
});

register({ type: "account" }, ({ field, obj }) => {
  const account_id = obj[field];
  if (!account_id) return null;
  return <Avatar key={account_id} account_id={account_id} />;
});
