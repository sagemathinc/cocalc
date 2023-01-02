import { useEffect, useState } from "react";
import { webapp_client } from "../webapp-client";

interface AccountName {
  firstName: string;
  lastName: string;
}

export default function useAccountName(account_id: string): AccountName | null {
  const [name, setName] = useState<AccountName | null>(null);
  useEffect(() => {
    (async () => {
      let user;
      try {
        user = await webapp_client.users_client.get_username(account_id);
      } catch (_err) {
        // TODO -- could have some sort of retry?
        return;
      }
      const { first_name: firstName, last_name: lastName } = user;
      setName({ firstName, lastName });
    })();
  }, [account_id]);

  return name;
}
