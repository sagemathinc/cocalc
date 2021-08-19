/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Task last changed: displays when this task was last changed
*/

import { React } from "../../app-framework";
import { TimeAgo } from "../../r_misc";

interface Props {
  last_edited?: number;
}

export const Changed: React.FC<Props> = React.memo(({ last_edited }) => {
  if (last_edited) {
    return <TimeAgo date={new Date(last_edited)} />;
  } else {
    return <span />;
  }
});
