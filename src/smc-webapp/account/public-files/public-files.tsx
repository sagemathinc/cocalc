/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";

/*

await cc.client.async_query({query:{all_public_paths:{id:null, project_id: null,
          path: null,
          description: null,
          disabled: null,
          unlisted: null,
          license: null,
          last_edited: null,
          created: null,
          last_saved: null,
          counter: null,
          compute_image: null}}});

*/

export const PublicFiles: React.FC = () => {
  return <div>Public Files </div>;
};
