/*
A smart anchor tag that in some cases changes children to
look nicer, and opens special targets in the same cocalc
page or document (e.g., for uri fragments), and opens
external links in a new tab instead of leaving cocalc.

In all cases, we also stop mousedown propagation so clicking
on this link doesn't trigger drag and drop / select of container
element, if enabled (e.g., for links in sticky notes in the
whiteboard).

TODO: we do nothing special with links to admin, settings, notifications, etc.
pages -- they just open in a new tab. But this is just a TODO. Note that
settings is mostly deprecated, notifications is rarely used, and admin is very
special...
*/

import { ReactNode } from "react";
import { A } from "@cocalc/frontend/components";
import { isCoCalcURL, parseCoCalcURL } from "@cocalc/frontend/lib/cocalc-urls";
import { redux } from "@cocalc/frontend/app-framework";
import { join } from "path";
import { path_split } from "@cocalc/util/misc";
import { Popover } from "antd";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { filename_extension } from "@cocalc/util/misc";
import { file_associations } from "@cocalc/frontend/file-associations";
import { Icon, IconName } from "@cocalc/frontend/components";
import Fragment, { FragmentId } from "@cocalc/frontend/misc/fragment-id";

interface Options {
  project_id: string;
  path: string;
  href?: string;
  title?: string;
  children?: ReactNode;
}

export default function SmartAnchorTag({
  href,
  title,
  children,
  project_id,
  path,
}: Options) {
  if (isCoCalcURL(href) && href?.includes("/projects/")) {
    return (
      <CoCalcURL project_id={project_id} href={href} title={title}>
        {children}
      </CoCalcURL>
    );
  }
  if (href?.includes("://")) {
    return (
      <NonCoCalcURL href={href} title={title}>
        {children}
      </NonCoCalcURL>
    );
  }
  if (href) {
    return (
      <InternalRelativeLink
        project_id={project_id}
        path={path}
        href={href}
        title={title}
      >
        {children}
      </InternalRelativeLink>
    );
  }
  // Fallback: no href target at all, so no special handling needed...
  return <a title={title}>{children}</a>;
}

// href starts with cocalc URL or is absolute,
// so we open the link directly inside this browser tab rather than
// opening an entirely new cocalc tab or navigating to it.
// NOTE: we assume children come from slate (i.e., it's markdown rendering)
// to do its magic; won't work well otherwise, but won't be broken.
// E.g., cocalc url's in html blocks don't get the treatment yet,
// but this is MUCH less likely to be needed, since there's no linkify
// happening there, so you're probably dealing with handcrafted a tags
// with proper children already.
function CoCalcURL({ href, title, children, project_id }) {
  const open = (e) => {
    const { project_id, page, target, fragmentId } = parseCoCalcURL(href);
    if (project_id != null && target != null) {
      e.preventDefault();
      loadTarget(
        project_id,
        decodeURI(target),
        !((e as any)?.which === 2 || e?.ctrlKey || e?.metaKey),
        fragmentId
      );
      return;
    } else if (page) {
      // opening a different top level page, e.g., all projects or account settings or something.
      e.preventDefault();
      redux.getActions("page").set_active_tab(page);
      return;
    }
    // this will fall back to default.
  };

  let message: ReactNode | undefined = undefined;
  let heading: ReactNode | undefined = undefined;
  let targetPath: string | undefined = undefined;
  let icon: IconName | undefined = undefined;
  const {
    project_id: target_project_id,
    target,
    fragmentId,
  } = parseCoCalcURL(href);
  if (target && target_project_id) {
    const replaceChildren =
      href == children?.[0]?.props?.element?.text ||
      decodeURI(href) == children?.[0]?.props?.element?.text;

    if (target == "files" || target == "files/") {
      if (replaceChildren) {
        children = <>Files</>;
      }
      icon = "folder-open";
      heading = "Files";
      message = (
        <>
          Browse files in{" "}
          {project_id == target_project_id ? (
            "this project"
          ) : (
            <ProjectTitle project_id={target_project_id} />
          )}
          .
        </>
      );
    } else if (target.startsWith("files/")) {
      targetPath = decodeURI(target).slice("files/".length);
      const filename = path_split(targetPath).tail;
      const hash = fragmentId ? `#${Fragment.encode(fragmentId)}` : "";
      if (project_id == target_project_id) {
        message = (
          <>
            Open <a onClick={open}>{filename}</a> in this project
            {fragmentId ? ` at ${hash}` : ""}
          </>
        );
      } else {
        message = (
          <>
            Open <a onClick={open}>{filename}</a> in the project{" "}
            <ProjectTitle project_id={target_project_id} />
            {fragmentId ? ` at ${hash}` : ""}
          </>
        );
      }
      if (replaceChildren) {
        children = (
          <>
            {targetPath}
            {hash}
          </>
        );
      }
      const ext = filename_extension(targetPath);
      const x = file_associations[ext];
      icon = x.icon;
      heading = <a onClick={open}>{targetPath}</a>;
    } else if (target.startsWith("settings")) {
      if (replaceChildren) {
        children = <>Settings</>;
      }
      icon = "wrench";
      heading = "Project Settings";
      message = (
        <>
          Open project settings in{" "}
          {project_id == target_project_id ? (
            "this project"
          ) : (
            <ProjectTitle project_id={target_project_id} />
          )}
          .
        </>
      );
    } else if (target.startsWith("log")) {
      if (replaceChildren) {
        children = <>Log</>;
      }
      icon = "history";
      heading = "Project Log";
      message = (
        <>
          Open project log in{" "}
          {project_id == target_project_id ? (
            "this project"
          ) : (
            <ProjectTitle project_id={target_project_id} />
          )}
          .
        </>
      );
    } else if (target.startsWith("search")) {
      if (replaceChildren) {
        children = <>Find</>;
      }
      icon = "search";
      heading = "Search in Files";
      message = (
        <>
          Search through files in{" "}
          {project_id == target_project_id ? (
            "this project"
          ) : (
            <ProjectTitle project_id={target_project_id} />
          )}
          .
        </>
      );
    } else if (target.startsWith("new")) {
      targetPath = decodeURI(target).slice("new/".length);
      if (replaceChildren) {
        children = <>New</>;
      }
      icon = "plus-circle";
      heading = "Create New File";
      message = (
        <>
          Create a new file in{" "}
          {project_id == target_project_id ? (
            "this project"
          ) : (
            <ProjectTitle project_id={target_project_id} />
          )}{" "}
          in the {targetPath ? <>directory "{targetPath}"</> : "home directory"}
          .
        </>
      );
    }
  }

  const link = (
    <a
      title={title}
      href={href}
      target={"_blank"}
      rel={"noopener" /* only used in case of fallback */}
      onClick={open}
      onMouseDown={
        (e) =>
          e.stopPropagation() /* this is so clicking links in something that is drag-n-droppable doesn't trigger dragging */
      }
    >
      {icon ? <Icon name={icon} style={{ marginRight: "5px" }} /> : ""}
      {children}
    </a>
  );
  if (message || heading) {
    // refactor with cocalc/src/packages/frontend/frame-editors/frame-tree/path.tsx
    return (
      <Popover
        title={
          <b
            style={{ maxWidth: "400px" }}
            onMouseDown={
              (e) => e.stopPropagation() /* see comment in link above */
            }
          >
            {icon ? <Icon name={icon} style={{ marginRight: "5px" }} /> : ""}
            {heading}
          </b>
        }
        content={
          <div
            style={{ maxWidth: "400px" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {message}
          </div>
        }
      >
        {link}
      </Popover>
    );
  }
  return link;
}

// External non-cocalc URL. We open in a new tab.  There's a lot of
// opportunity to make these links look nice, similar to what we do
// with CoCalcURL above.  E.g., links to github could be made nicer
// if current directory is the same repo, etc.  However, that is
// for another day!
function NonCoCalcURL({ href, title, children }) {
  return (
    <A
      onMouseDown={(e) => e.stopPropagation()}
      href={href}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {children}
    </A>
  );
}

// Internal relative link in the same project or even the
// same document (e.g., for a URI fragment).
function InternalRelativeLink({ project_id, path, href, title, children }) {
  return (
    <a
      onMouseDown={(e) => e.stopPropagation()}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = new URL("http://dummy/" + href);
        const fragmentId = Fragment.decode(url.hash);
        const hrefPlain = url.pathname.slice(1);
        let target;
        if (!hrefPlain) {
          // within the same file
          target = join("files", path);
        } else {
          // different file in the same project, with link being relative
          // to current path.
          target = join(
            "files",
            path ? path_split(path).head : "",
            decodeURI(hrefPlain)
          );
        }
        loadTarget(
          project_id,
          target,
          !((e as any).which === 2 || e.ctrlKey || e.metaKey),
          fragmentId
        );
      }}
      title={title}
    >
      {children}
    </a>
  );
}

function loadTarget(
  project_id: string,
  target: string,
  switchTo: boolean,
  fragmentId?: FragmentId
): void {
  // get rid of "?something" in "path/file.ext?something"
  const i = target.lastIndexOf("/");
  if (i > 0) {
    const j = target.slice(i).indexOf("?");
    if (j >= 0) target = target.slice(0, i + j);
  }
  // open project
  redux
    .getActions("projects")
    .open_project({ switch_to: switchTo, project_id });
  // open file in project
  redux
    .getProjectActions(project_id)
    .load_target(target, switchTo, false, true, fragmentId);
  if (switchTo) {
    // show project if switchTo
    redux.getActions("page").set_active_tab(project_id);
  }
}
