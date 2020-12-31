/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button, Input } from "antd";
import { React, useMemo, useState } from "../../app-framework";
import { PublicPath } from "smc-util/db-schema/public-paths";
import { plural } from "smc-util/misc";

interface Props {
  data?: PublicPath[];
}

export const UnpublishEverything: React.FC<Props> = React.memo(({ data }) => {
  const [confirm, set_confirm] = useState<boolean>(false);
  const [confirm_text, set_confirm_text] = useState<string>("");

  const num_published = useMemo(() => {
    if (data == null) return -1;
    let n = 0;
    for (const x of data) {
      if (!x.disabled) {
        n += 1;
      }
    }
    return n;
  }, [data]);

  function render_confirm(): JSX.Element {
    const goal = "YES, UNPUBLISH EVERYTHING!";
    const body = (
      <div>
        {`Are you sure you want to unpublish ALL ${num_published} ${plural(
          num_published,
          "path"
        )} published in all projects on which you collaborate?  You cannot easily undo this operation, though you could tediously republish everything.  To unpublish everything type "${goal}" below, then click the button.`}
        <br />
        <br />
        <Input
          size="large"
          placeholder={goal}
          value={confirm_text}
          onChange={(e) => set_confirm_text(e.target.value)}
        />
        <br />
        <br />
        <Button
          disabled={confirm_text != goal}
          onClick={() => {
            console.log("do the deed!");
            set_confirm(false);
            set_confirm_text("");
          }}
        >
          Unpublish everything
        </Button>
      </div>
    );
    return (
      <Alert
        style={{ marginBottom: "20px" }}
        message="Unpublish Everything?"
        description={body}
        type="warning"
        showIcon
        closable
        afterClose={() => {
          set_confirm(false);
          set_confirm_text("");
        }}
      />
    );
  }

  return (
    <div>
      {confirm && render_confirm()}
      <Button
        onClick={() => set_confirm(true)}
        disabled={num_published == 0 || confirm}
      >
        Unpublish everything...
      </Button>
    </div>
  );
});
