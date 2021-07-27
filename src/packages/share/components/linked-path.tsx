/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";

interface Props {
  id: string;
  path: string;
  relativePath: string;
  isdir?: boolean;
}

export default function LinkedPath({ id, path, relativePath, isdir }: Props) {
  let href = `/public_paths/${id}`;
  const first = (
    <Link href={href} key={href}>
      <a>{path}</a>
    </Link>
  );
  const slash = (key) => <span key={"slash" + key}> / </span>;
  const segments: JSX.Element[] = [first, slash(href)];
  for (const segment of relativePath.split("/")) {
    if (!segment) continue;
    href += `/${encodeURIComponent(segment)}`;
    segments.push(
      <Link href={href} key={href}>
        <a>{segment}</a>
      </Link>
    );
    segments.push(slash(href));
  }
  if (!isdir) {
    segments.pop();
  }
  return <>{segments}</>;
}
