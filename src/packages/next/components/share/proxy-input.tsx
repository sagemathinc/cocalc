/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Input } from "antd";
import { useRouter } from "next/router";
import { useState } from "react";

import A from "components/misc/A";
import SiteName from "components/share/site-name";

export default function ProxyInput() {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [show, setShow] = useState<boolean>(false);

  return (
    <div style={{ margin: "15px 0" }}>
      <A href="https://doc.cocalc.com/share.html">Publish what you create</A> in{" "}
      <SiteName /> or{" "}
      {show ? (
        <>
          paste a URL to a <A href="http://github.com/">GitHub</A> repository or{" "}
          <A href="https://gist.github.com/">Gist</A>:
        </>
      ) : (
        <a onClick={() => setShow(true)}>
          paste a URL to a GitHub repository or Gist.
        </a>
      )}
      {show && (
        <Input.Search
          style={{ marginTop: "10px" }}
          placeholder="URL to GitHub repository or Gist"
          allowClear
          enterButton="View GitHub Repository or Gist"
          onSearch={(url) => {
            try {
              router.push(urlToProxyURL(url));
            } catch (err) {
              setError(`${err}`);
            }
          }}
        />
      )}
      {error && (
        <Alert
          style={{ marginTop: "15px" }}
          type="error"
          message={error}
          showIcon
        />
      )}
    </div>
  );
}

// INPUT: a URL to something on the internet
// OUTPUT: a URL on the share serve (without the http, host stuff)
//         that proxies that input URL.
// The cases we treat are:
//     - gist
//     - github user or repo
//     - general URL fallback, if none of the above apply
//
// NOTE: we implemented general URL's.  HOWEVER spammers use this to
// automate creating large numbers of links from cocalc to their bullshit
// pages to improve their SEO ranking.  Thus we restrict only to github.
//
function urlToProxyURL(url: string): string {
  const { host, pathname } = new URL(url);
  if (host == new URL(document.URL).host) {
    // URL on this very server - just go to it
    return url;
  } else if (host == "github.com") {
    return `/github${pathname}`;
  } else if (host == "gist.github.com") {
    return `/gist${pathname}`;
  } else {
    throw Error("The URL most be to content on github.com.");
  }
}
