/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useEffect, useState } from "react";
import { Alert, Avatar as AntdAvatar, Button, Divider, Tooltip } from "antd";
import Link from "next/link";
import PathContents from "components/share/path-contents";
import PathActions from "components/share/path-actions";
import LinkedPath from "components/share/linked-path";
import Loading from "components/share/loading";
import License from "components/share/license";
import ProjectLink from "components/share/project-link";
import useCounter from "lib/share/counter";
import { Layout } from "components/share/layout";
import { Customize } from "lib/share/customize";
import type { CustomizeType } from "lib/customize";
import { getTitle } from "lib/share/util";
import SanitizedMarkdown from "components/misc/sanitized-markdown";
import Badge from "components/misc/badge";
import { Icon } from "@cocalc/frontend/components/icon";
import {
  SHARE_AUTHENTICATED_ICON,
  SHARE_AUTHENTICATED_EXPLANATION,
} from "@cocalc/util/consts/ui";
import apiPost from "lib/api/post";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import { useRouter } from "next/router";
import type { PathContents as PathContentsType } from "lib/share/get-contents";
import Avatar from "components/share/proxy/avatar";
import A from "components/misc/A";
import { join } from "path";

interface Props {
  id: string;
  path: string;
  url: string;
  project_id: string;
  projectTitle?: string;
  relativePath?: string;
  description?: string;
  counter?: number;
  compute_image?: string;
  license?: string;
  contents?: PathContentsType;
  error?: string;
  customize: CustomizeType;
  disabled?: boolean;
  unlisted?: boolean;
  authenticated?: boolean;
  stars?: number;
  isStarred?: boolean;
  githubOrg?: string; // if given, this is being mirrored from this github org
  githubRepo?: string; // if given, mirrored from this github repo.
  projectAvatarImage?: string; // optional 320x320 image representing the project from which this was shared
  // Do a redirect to here; this is due to names versus id and is needed when
  // visiting this by following a link from within the share server that
  // doesn't use the names. See https://github.com/sagemathinc/cocalc/issues/6115
  redirect?: string;
}

export default function PublicPath({
  id,
  path,
  url,
  project_id,
  projectTitle,
  relativePath = "",
  description,
  counter,
  compute_image,
  license,
  contents,
  error,
  customize,
  disabled,
  unlisted,
  authenticated,
  stars = 0,
  isStarred: isStarred0,
  githubOrg,
  githubRepo,
  projectAvatarImage,
  redirect,
}: Props) {
  useCounter(id);
  const [numStars, setNumStars] = useState<number>(stars);

  const [isStarred, setIsStarred] = useState<boolean | null | undefined >(
    isStarred0 ?? null
  );
  useEffect(() => {
    setIsStarred(isStarred0);
  }, [isStarred0]);

  const [signingUp, setSigningUp] = useState<boolean>(false);
  const router = useRouter();

  useEffect(() => {
    if (redirect) {
      router.replace(redirect);
    }
  }, [redirect]);

  if (id == null) return <Loading style={{ fontSize: "30px" }} />;

  function visibility_explanation() {
    if (disabled) {
      return (
        <>
          <Icon name="lock" /> Private (only visible to collaborators on the
          project)
        </>
      );
    }
    if (unlisted) {
      return (
        <>
          <Icon name="eye-slash" /> Unlisted (only visible to those who know the
          link)
        </>
      );
    }
    if (authenticated) {
      return (
        <>
          <Icon name={SHARE_AUTHENTICATED_ICON} /> Authenticated (
          {SHARE_AUTHENTICATED_EXPLANATION})
        </>
      );
    }
  }

  function visibility() {
    if (unlisted || disabled || authenticated) {
      return (
        <div>
          <b>Visibility:</b> {visibility_explanation()}
        </div>
      );
    }
  }

  async function star() {
    setIsStarred(true);
    setNumStars(numStars + 1);
    // Actually do the api call after changing state, so it is
    // maximally snappy.  Also, being absolutely certain that star/unstar
    // actually worked is not important.
    await apiPost("/public-paths/star", { id });
  }

  async function unstar() {
    setIsStarred(false);
    setNumStars(numStars - 1);
    await apiPost("/public-paths/unstar", { id });
  }

  function renderStar() {
    const badge = (
      <Badge
        count={numStars}
        style={{
          marginLeft: "10px",
          marginTop: "-2.5px",
        }}
      />
    );
    if (isStarred == null) {
      // not signed in ==> isStarred is null or undefined.
      return (
        <Button
          onClick={() => {
            setSigningUp(!signingUp);
          }}
          title={"Sign in to star"}
        >
          <Icon name="star" /> Star {badge}
        </Button>
      );
    }
    // Signed in so isStarred is true or false.
    let btn;
    if (isStarred == true) {
      btn = (
        <Button onClick={unstar}>
          <Icon name="star-filled" style={{ color: "#eac54f" }} /> Starred{" "}
          {badge}
        </Button>
      );
    } else {
      btn = (
        <Button onClick={star}>
          <Icon name="star" /> Star {badge}
        </Button>
      );
    }
    return (
      <div style={{ textAlign: "center" }}>
        {btn}
        <br />
        <A href="/stars">Your stars...</A>
      </div>
    );
  }

  function renderProjectLink() {
    if (githubOrg && githubRepo) {
      return (
        <Tooltip
          title="Go to the top level of the repository."
          placement="right"
        >
          <b>
            <Icon name="home" /> GitHub Repository:{" "}
          </b>
          <A href={`/github/${githubOrg}/${githubRepo}`}>
            {githubOrg}/{githubRepo}
          </A>
          <br />
        </Tooltip>
      );
    }
    if (url) {
      let name, target;
      const i = url.indexOf("/");
      if (url.startsWith("gist")) {
        target = `https://gist.github.com/${url.slice(i + 1)}`;
        name = "GitHub Gist";
      } else {
        target = "https://" + url.slice(i + 1);
        name = "URL";
      }
      // NOTE: it could conceivable only be http:// display will work, but this
      // link will be wrong. I'm not going to worry about that.
      return (
        <Tooltip
          placement="right"
          title={`This file is hosted at ${target}. Click to open in a new tab.`}
        >
          <b>
            <Icon name="external-link" /> {name}:{" "}
          </b>
          <A href={target}>{target}</A>
          <br />
        </Tooltip>
      );
    }
    return (
      <div>
        <b>Project:</b>{" "}
        <ProjectLink project_id={project_id} title={projectTitle} />
        <br />
      </div>
    );
  }

  function renderPathLink() {
    if (githubRepo) {
      const segments = url.split("/");
      return (
        <Tooltip
          placement="right"
          title="This is hosted on GitHub. Click to open GitHub in a new tab."
        >
          <b>
            <Icon name="external-link" /> Path:{" "}
          </b>
          <A href={`https://github.com/${join(...segments.slice(1))}`}>
            {segments.length > 3
              ? join(...segments.slice(3))
              : join(...segments.slice(1))}
          </A>
          <br />
        </Tooltip>
      );
    }

    if (url) return;

    return (
      <div>
        <b>Path: </b>
        <LinkedPath
          path={path}
          relativePath={relativePath}
          id={id}
          isDir={contents?.isdir}
        />
        <br />
      </div>
    );
  }

  return (
    <Customize value={customize}>
      <Layout
        title={getTitle({ path, relativePath })}
        top={
          projectAvatarImage ? (
            <AntdAvatar
              shape="square"
              size={160}
              icon={<img src={projectAvatarImage} />}
              style={{ float: "left", margin: "10px" }}
            />
          ) : undefined
        }
      >
        {githubOrg && (
          <Avatar
            size={96}
            name={githubOrg}
            style={{ float: "right", marginLeft: "15px" }}
          />
        )}
        <div>
          <div style={{ float: "right" }}>{renderStar()}</div>
          {signingUp && (
            <Alert
              style={{ margin: "0 auto", maxWidth: "400px" }}
              type="warning"
              message={
                <InPlaceSignInOrUp
                  title="Star Shared Files"
                  why="to star this"
                  onSuccess={() => {
                    star();
                    setSigningUp(false);
                    router.reload();
                  }}
                />
              }
            />
          )}
          {description?.trim() && (
            <SanitizedMarkdown
              style={
                { marginBottom: "-1em" } /* -1em to undo it being a paragraph */
              }
              value={description}
            />
          )}
          {renderProjectLink()}
          {renderPathLink()}
          {counter && (
            <>
              <b>
                <Icon name="eye" /> Views:
              </b>{" "}
              <Badge count={counter} />
              <br />
            </>
          )}
          {license && (
            <>
              <b>License:</b> <License license={license} />
              <br />
            </>
          )}
          {visibility()}
          {compute_image && (
            <>
              <b>Image:</b> {compute_image}
              <br />
            </>
          )}
          <PathActions
            id={id}
            path={path}
            url={url}
            relativePath={relativePath}
            isDir={contents?.isdir}
            exclude={new Set(["hosted"])}
            project_id={project_id}
            image={compute_image}
            description={description}
          />
        </div>
        <Divider />
        {error != null && (
          <Alert
            showIcon
            type="error"
            style={{ maxWidth: "700px", margin: "30px auto" }}
            message="Error loading file"
            description={
              <div>
                There was a problem loading{" "}
                {relativePath ? relativePath : "this file"} in{" "}
                <Link href={`/share/public_paths/${id}`}>
                  <a>{path}.</a>
                </Link>
                <br />
                <br />
                {error}
              </div>
            }
          />
        )}
        {contents != null && (
          <PathContents
            id={id}
            relativePath={relativePath}
            path={path}
            {...contents}
          />
        )}
      </Layout>
    </Customize>
  );
}
