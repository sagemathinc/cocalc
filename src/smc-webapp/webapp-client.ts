/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2014 -- 2016, SageMath, Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

//###########################################
// connection to back-end hub
//###########################################

// The following interface obviously needs to get completed,
// and then of course all of webapp client itself needs to
// be rewritten in Typescript.  In the meantime, this might
// at least prevent a typo.  When something you need from the
// actual webapp client isn't here, add it (there api is huge).

interface WebappClient {
  user_search: Function;
  server_time: Function;
  project_set_quotas: Function;
  copy_path_between_projects: Function;
  write_text_file_to_project: Function;
  exec: Function;
  find_directories: Function;
  sync_db2: Function;
}

export let webapp_client: WebappClient;

if (
  typeof window !== "undefined" &&
  window !== null &&
  window.location != null
) {
  // running in a web browser
  if (window.app_base_url == null) {
    window.app_base_url = "";
  }

  if (window.location.hash.length > 1) {
    let q = decodeURIComponent(window.location.hash.slice(1));
    // the location hash could again contain a query param, hence this
    const i = q.indexOf("?");
    if (i >= 0) {
      q = q.slice(0, i);
    }
    (window as any).smc_target = q;
  }

  const client_browser = require("./client_browser");
  webapp_client = client_browser.connect() as WebappClient;
} else {
  webapp_client = ({} as unknown) as WebappClient; // will never get used in this case...
}
