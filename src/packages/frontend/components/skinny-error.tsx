/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { SimpleX } from "./simple-x";

interface Props {
  error_text: string;
  on_close: () => void;
}

export function SkinnyError({ error_text, on_close }: Props) {
  return (
    <div style={{ color: "red" }}>
      <SimpleX onClick={on_close} /> {error_text}
    </div>
  );
}
