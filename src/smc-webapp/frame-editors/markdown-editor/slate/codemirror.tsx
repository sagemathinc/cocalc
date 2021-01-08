/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../../app-framework";

interface Props {
  onChange: (string) => void;
  value: string;
}
export const SlateCodeMirror: React.FC<Props> = ({ value, onChange }) => {
  return (
    <textarea
      contentEditable={false}
      rows={4}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    ></textarea>
  );
};
