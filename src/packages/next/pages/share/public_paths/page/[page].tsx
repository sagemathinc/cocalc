/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This is simply a list of *all* publicly shared files/directories,
with a simple page.  It is mainly meant to be walked by crawlers
such as Google and for people to browse.
*/

import { useEffect, useState } from "react";
import { Alert, Button, Input, Popconfirm, Radio, Space } from "antd";
import Link from "next/link";
import SiteName from "components/share/site-name";
import getPool, { timeInSeconds } from "@cocalc/database/pool";
import PublicPaths from "components/share/public-paths";
import { Layout } from "components/share/layout";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/share/customize";
import GoogleSearch from "components/share/google-search";
import ProxyInput from "components/share/proxy-input";
import getAccountId from "lib/account/get-account";
import A from "components/misc/A";
import { useRouter } from "next/router";
import useProfile from "lib/hooks/profile";
import apiPost from "lib/api/post";

const PAGE_SIZE = 100;

function getPage(obj): number {
  let { page } = obj ?? {};
  if (page == null) {
    return 1;
  }
  page = parseInt(page);
  if (isFinite(page)) {
    return Math.max(page, 1);
  }
  return 1;
}

function Pager({ page, publicPaths }) {
  const router = useRouter();

  return (
    <div>
      Page {page}
      &nbsp;&nbsp;
      {page > 1 ? (
        <Link
          href={{
            pathname: `/share/public_paths/page/${page - 1}`,
            query: router.query,
          }}
          as={`/share/public_paths/page/${page - 1}${
            router.asPath.split("?")[1] ? "?" + router.asPath.split("?")[1] : ""
          }`}
          passHref
        >
          Previous
        </Link>
      ) : (
        <span style={{ color: "#888" }}>Previous</span>
      )}
      &nbsp;&nbsp;
      {publicPaths != null && publicPaths.length >= PAGE_SIZE ? (
        <Link
          href={{
            pathname: `/share/public_paths/page/${page + 1}`,
            query: router.query,
          }}
          as={`/share/public_paths/page/${page + 1}${
            router.asPath.split("?")[1] ? "?" + router.asPath.split("?")[1] : ""
          }`}
          passHref
        >
          Next
        </Link>
      ) : (
        <span style={{ color: "#888" }}>Next</span>
      )}
    </div>
  );
}

export default function All({ page, publicPaths, customize }) {
  const pager = <Pager page={page} publicPaths={publicPaths} />;
  const router = useRouter();
  const [sort, setSort] = useState<string>("last_edited");

  // Set default value of `sort` from query parameter `sort`
  useEffect(() => {
    if (router.query.sort) {
      setSort(router.query.sort as string);
    }
  }, [router.query.sort]);

  function handleSortChange(e) {
    const sort = e.target.value;
    // Update the query parameter with new `sort` value
    router.push({
      pathname: router.pathname,
      query: { ...router.query, sort },
    });
  }

  const [search, setSearch] = useState<string>("");
  useEffect(() => {
    if (router.query.search) {
      setSearch(router.query.search as string);
    }
  }, [router.query.search]);

  function handleSearchGo(search: string) {
    router.push({
      pathname: router.pathname,
      query: { ...router.query, search },
    });
  }

  return (
    <Customize value={customize}>
      <Layout title={`Page ${page} of public files`}>
        <div>
          <Space
            style={{
              float: "right",
              justifyContent: "flex-end",
              marginTop: "7.5px",
            }}
            direction="vertical"
          >
            <GoogleSearch style={{ width: "450px", maxWidth: "90vw" }} />
          </Space>
          <h2>
            Browse publicly shared documents on <SiteName />
          </h2>
          <ProxyInput />
          Star items to easily <A href="/stars">find them in your list</A>
          .
          <br />
          <br />
          <Input.Search
            allowClear
            placeholder="Search path & description..."
            style={{ marginLeft: "5px", float: "right", width: "275px" }}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value) {
                setTimeout(() => {
                  handleSearchGo("");
                }, 1);
              }
            }}
            onSearch={() => handleSearchGo(search)}
            onPressEnter={() => handleSearchGo(search)}
          />
          <Radio.Group
            value={sort}
            onChange={handleSortChange}
            style={{ float: "right" }}
          >
            <Radio.Button value="last_edited">Newest</Radio.Button>
            <Radio.Button value="-last_edited">Oldest</Radio.Button>
            <Radio.Button value="stars">Stars</Radio.Button>
            <Radio.Button value="-stars">Least stars</Radio.Button>
            <Radio.Button value="views">Views</Radio.Button>
            <Radio.Button value="-views">Least views</Radio.Button>
          </Radio.Group>
          {pager}
          <br />
          {typeof router.query.search == "string" &&
            router.query.search.trim() &&
            publicPaths.length > 0 && (
              <AdminUnpublish publicPaths={publicPaths} />
            )}
          <PublicPaths publicPaths={publicPaths} />
          <br />
          {pager}
        </div>
      </Layout>
    </Customize>
  );
}

async function adminUnpublish(id: string): Promise<void> {
  const query = {
    crm_public_paths: {
      id,
      disabled: true,
    },
  };
  await apiPost("/user-query", { query });
}

function AdminUnpublish({ publicPaths }) {
  const profile = useProfile();
  const router = useRouter();
  const [error, setError] = useState("");

  if (!profile?.is_admin) return null;

  const handleUnpublish = async () => {
    setError("");
    try {
      await Promise.all(publicPaths.map((x) => adminUnpublish(x.id)));
    } catch (error) {
      setError(error.toString());
    }
    // refresh the current page
    router.push({
      pathname: router.pathname,
      query: router.query,
    });
  };

  return (
    <Alert
      style={{ margin: "0 0 15px" }}
      type="info"
      message={"Administrator Controls"}
      description={
        <div>
          {error && (
            <Alert
              showIcon
              style={{ margin: "15px 0" }}
              message={"Error"}
              description={error}
              type="error"
              closable
              onClose={() => setError("")}
            />
          )}
          <Popconfirm
            title={
              <div style={{ width: "400px" }}>
                Are you sure you want to unpublish ALL {publicPaths.length}{" "}
                items displayed below? These items will be made completely
                private (not visible in any way, except to collaborators).
              </div>
            }
            onConfirm={handleUnpublish}
            okText="Yes"
            cancelText="No"
          >
            <Button danger>
              Unpublish ALL {publicPaths.length} listed items...
            </Button>
          </Popconfirm>
        </div>
      }
    />
  );
}

export async function getServerSideProps(context) {
  const isAuthenticated = (await getAccountId(context.req)) != null;
  const page = getPage(context.params);
  const sort = getSort(context);
  const { search, searchQuery } = getSearch(context);
  const pool = getPool("medium");
  const params = [isAuthenticated, PAGE_SIZE, PAGE_SIZE * (page - 1)];
  if (search) {
    params.push(search);
  }
  const { rows } = await pool.query(
    `SELECT public_paths.id, public_paths.path, public_paths.url, public_paths.description, ${timeInSeconds(
      "public_paths.last_edited",
      "last_edited",
    )}, projects.avatar_image_tiny,
    counter::INT,
     (SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=public_paths.id) AS stars
    FROM public_paths, projects
    WHERE public_paths.project_id = projects.project_id
    AND public_paths.vhost IS NULL AND public_paths.disabled IS NOT TRUE AND public_paths.unlisted IS NOT TRUE AND
    public_paths.url IS NULL AND
    ((public_paths.authenticated IS TRUE AND $1 IS TRUE) OR (public_paths.authenticated IS NOT TRUE))
    ${searchQuery}
    ORDER BY ${sort} LIMIT $2 OFFSET $3`,
    params,
  );

  return await withCustomize({ context, props: { page, publicPaths: rows } });
}

function getSearch(context) {
  const { query } = context;
  const search = query?.search || "";
  if (search) {
    return {
      search: `%${search}%`,
      searchQuery:
        "AND (LOWER(public_paths.path) LIKE LOWER($4) OR LOWER(public_paths.description) LIKE LOWER($4))",
    };
  } else {
    return { search, searchQuery: "" };
  }
}

function getSort(context) {
  switch (context.query?.sort) {
    case "stars":
      return "stars DESC, public_paths.last_edited DESC";
    case "-stars":
      return "stars ASC, public_paths.last_edited DESC";
    case "views":
      return "COALESCE(counter,0) DESC,  public_paths.last_edited DESC";
    case "-views":
      return "COALESCE(counter,0) ASC,  public_paths.last_edited DESC";
    case "-last_edited":
      return "public_paths.last_edited ASC";
    default:
      return "public_paths.last_edited DESC";
  }
}
