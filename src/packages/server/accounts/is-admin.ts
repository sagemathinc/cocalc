import userIsInGroup from "./is-in-group";

export default async function isAdmin(account_id: string): Promise<boolean> {
  return await userIsInGroup(account_id, "admin");
}
