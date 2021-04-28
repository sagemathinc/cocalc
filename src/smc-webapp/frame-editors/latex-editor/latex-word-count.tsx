/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useRedux } from "../../app-framework";

interface LatexWordCountProps {
  name: string;
  actions: any;
  font_size: number;
}

export const LatexWordCount: React.FC<LatexWordCountProps> = React.memo(
  (props: LatexWordCountProps) => {
    const { name, actions, font_size } = props;

    const word_count = useRedux([name, "word_count"]) ?? "";

    React.useEffect(function () {
      // false: don't force it
      actions.word_count(0, false);
    }, []);

    return (
      <div
        cocalc-test={"word-count-output"}
        className={"smc-vfill"}
        style={{
          overflowY: "scroll",
          padding: "5px 15px",
          fontSize: `${font_size * 0.8}pt`,
          whiteSpace: "pre-wrap",
          fontFamily: "monospace",
        }}
      >
        {word_count}
      </div>
    );
  }
);
