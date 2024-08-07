/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export default function ExternalLink(props) {
  return (
    <a {...props} target={"_blank"} rel={"noopener"}>
      {props.children}
    </a>
  );
}
