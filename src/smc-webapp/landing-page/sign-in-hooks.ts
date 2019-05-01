const { webapp_client } = require("../webapp_client");
import { len, startswith } from "smc-util/misc2";

webapp_client.on("signed_in", () => {
  if (localStorage == null) return;

  for (let event of ["sign_up_how_find_cocalc", "landing_page_utm"]) {
    let value = localStorage[event];
    if (value != null) {
      delete localStorage[event];
      webapp_client.user_tracking({ event, value });
    }
  }
});

import { parse } from "query-string";

function parse_utm() {
  const i = location.href.indexOf("?");
  if (i == -1) return;

  const query = parse(location.href.slice(i + 1));
  if (query == null) return;
  const utm: any = {};
  for (let key in query) {
    if (startswith(key, "utm_")) {
      utm[key] = query[key];
    }
  }
  if (len(utm) > 0) {
    localStorage.landing_page_utm = JSON.stringify(utm);
  }
}

parse_utm();
