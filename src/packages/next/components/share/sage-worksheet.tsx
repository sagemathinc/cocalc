/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */


interface Props {
  content: string;
}

export default function SageWorksheet({ content }: Props) {
  return <div>Sage Worksheets are Deprecated<pre>{content}</pre></div>
}
