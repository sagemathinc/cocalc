/*
Not used yet, but planned.
*/

import { redux } from "@cocalc/frontend/app-framework";

export default function Address({ name }) {
  const dns = redux.getStore("customize")?.get("dns");
  if (!dns) return null;
  return (
    <span>
      {name}.{dns}
    </span>
  );
}
