/*
Your most recent monthly statement and payment status.
*/

import Statements from "./statements";

export default function Statement() {
  return (
    <div>
      <Statements limit={1} interval="month" noRefresh />
    </div>
  );
}
