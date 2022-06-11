import { ReactNode } from "react";
import { A } from "@cocalc/frontend/components";
import { isCoCalcURL, parseCoCalcURL } from "@cocalc/frontend/lib/cocalc-urls";
import { redux } from "@cocalc/frontend/app-framework";
import { join } from "path";
import { path_split } from "@cocalc/util/misc";
import Fragment, { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import { Popover } from "antd";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { filename_extension } from "@cocalc/util/misc";
import { file_associations } from "../../file-associations";
import { Icon, IconName } from "../../components";

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

interface Options {
  project_id: string;
  path: string;
}

export default function getAnchorTagComponent({ project_id, path }: Options) {
  return function AnchorTagComponent({ href, title, children }) {
    if (isCoCalcURL(href) && href.includes("/projects/")) {
      // CASE: Link inside a specific browser tab.
      // target starts with cloud URL or is absolute, and has /projects/ in it,
      // so we open the link directly inside this browser tab.

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
              in the{" "}
              {targetPath ? <>directory "{targetPath}"</> : "home directory"}.
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
                {icon ? (
                  <Icon name={icon} style={{ marginRight: "5px" }} />
                ) : (
                  ""
                )}
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
    if (href?.includes("://")) {
      // external non-cocalc URL. We open in a new tab.  Also stop prop so doesn't focus element that is clicked on.
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
    if (href) {
      // Internal relative link in the same project or even document (e.g., for a URI fragment)
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
    // Fallback: no href target at all, so no special handling needed...
    return <a title={title}>{children}</a>;
  };
}
