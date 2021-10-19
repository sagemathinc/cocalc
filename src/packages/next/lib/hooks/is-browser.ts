/*
Use this hook if you want to render with react
ONLY on the client.

This is much better than using process.browser,
since it will NOT render the thing on the server,
will render it on the client, and the react SSR
hydration will not be thrown off like it is with
process.browser.
*/

import { useEffect, useState } from "react";

export default function useIsClient(): boolean {
  const [loaded, setLoaded] = useState<boolean>(false);
  useEffect(() => setLoaded(true), []);
  return loaded;
}
