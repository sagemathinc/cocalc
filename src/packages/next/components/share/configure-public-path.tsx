import { useEffect, useState } from "react";
import { Alert, Divider, Radio, Input, Select, Space } from "antd";
import useDatabase from "lib/hooks/database";
import Loading from "./loading";
import { LICENSES } from "@cocalc/frontend/share/licenses";
import SaveButton from "components/misc/save-button";
import EditRow from "components/misc/edit-row";
import A from "components/misc/A";
import SelectSiteLicense from "components/misc/select-site-license";
import { Icon } from "@cocalc/frontend/components/icon";
import LaTeX from "components/landing/latex";
import { useRouter } from "next/router";

const { Option } = Select;

interface Props {
  id: string;
  project_id: string;
  path: string;
}

const QUERY = {
  name: null,
  description: null,
  disabled: null,
  unlisted: null,
  license: null,
  compute_image: null,
};

interface Info {
  name?: string;
  description?: string;
  disabled?: boolean;
  unlisted?: boolean;
  license?: string;
  compute_image?: string;
  site_license_id?: string;
}

export default function ConfigurePublicPath({ id, project_id, path }: Props) {
  const router = useRouter();
  const publicPaths = useDatabase({
    public_paths: { ...QUERY, id, project_id, path },
  });
  const siteLicense = useDatabase({
    public_paths_site_license_id: {
      site_license_id: null,
      id,
      project_id,
      path,
    },
  });

  const [loaded, setLoaded] = useState<boolean>(false);
  const [edited, setEdited] = useState<Info>({});
  const [original, setOriginal] = useState<Info>({});
  const [error, setError] = useState<string>("");

  // After loading finishes, either editor or error is set.
  useEffect(() => {
    if (publicPaths.loading || siteLicense.loading) return;
    if (publicPaths.error) {
      setError(publicPaths.error);
      return;
    }
    if (siteLicense.error) {
      setError(siteLicense.error);
      return;
    }
    const { site_license_id } = siteLicense.value.public_paths_site_license_id;
    const { public_paths } = publicPaths.value;
    const x = { ...public_paths, site_license_id };
    setEdited(x);
    setOriginal(x);
    setLoaded(true);
  }, [publicPaths.loading, siteLicense.loading]);

  if (!loaded) {
    return <Loading delay={0.2} />;
  }

  // cheap to compute, so we compute every time.
  const visibility = edited.disabled
    ? "private"
    : edited.unlisted
    ? "unlisted"
    : "listed";

  const save = (
    <SaveButton
      edited={edited}
      original={original}
      setOriginal={setOriginal}
      table="public_paths"
      onSave={() => router.reload()}
    />
  );

  return (
    <div
      style={{
        width: "100%",
        border: "1px solid #eee",
        padding: "15px",
        marginTop: "15px",
      }}
    >
      {error && <Alert type="error" message={error} showIcon />}
      {save}
      <Divider>How you are sharing "{path}"</Divider>
      <Space direction="vertical" style={{ width: "100%" }}>
        <EditRow
          label="Describe what you are sharing"
          description={
            <>
              Use relevant keywords, inspire curiosity by providing just enough
              information to explain what this is about, and keep your
              description to about two lines. Use Markdown and <LaTeX />. You
              can change this at any time.
            </>
          }
        >
          <Input.TextArea
            style={{ width: "100%" }}
            value={edited.description}
            onChange={(e) =>
              setEdited({ ...edited, description: e.target.value })
            }
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
        </EditRow>
        <EditRow
          label="Choose a name for a nicer URL"
          description="An optional name can provide a much nicer and more memorable URL.  You must also name your project (in project settings) and the owner of the project to get a nice URL.  (WARNING: Changing this once it is set can break links, since automatic redirection is not implemented.)"
        >
          <Input
            style={{ maxWidth: "100%", width: "30em" }}
            value={edited.name}
            onChange={(e) => setEdited({ ...edited, name: e.target.value })}
          />
        </EditRow>
        <EditRow
          label="Listed, Unlisted or Private?"
          description="You make files or directories public to the world, either indexed by
      search engines (listed), or only visible with the link (unlisted). Public files
      are automatically copied to the public server within about 30 seconds
      after you explicitly edit them.  You can also set a site license for unlisted public shares."
        >
          <Space direction="vertical">
            <Radio.Group
              value={visibility}
              onChange={(e) => {
                switch (e.target.value) {
                  case "listed":
                    setEdited({ ...edited, unlisted: false, disabled: false });
                    break;
                  case "unlisted":
                    setEdited({ ...edited, unlisted: true, disabled: false });
                    break;
                  case "private":
                    setEdited({ ...edited, unlisted: true, disabled: true });
                    break;
                }
              }}
            >
              <Space direction="vertical">
                <Radio value={"listed"}>
                  <Icon name="eye" /> <em>Public (listed): </em> anybody can
                  find this via search.
                </Radio>
                <Radio value={"unlisted"}>
                  <Icon name="eye-slash" /> <em>Public (unlisted):</em> only
                  people with the link can view this.
                </Radio>
                <Radio value={"private"}>
                  <Icon name="lock" /> <em>Private:</em> only collaborators on
                  the project can view this.
                </Radio>
              </Space>
            </Radio.Group>
          </Space>
        </EditRow>
        {visibility == "unlisted" && (
          <EditRow
            label="Upgrade with a site license?"
            description={
              <>
                For unlisted shares, you can select a site license that you
                manage, and anybody who edits a copy of this share will have
                this site license applied to their project. You can track and
                remove usage of this license in the{" "}
                <A>license management page</A> (coming soon).
              </>
            }
          >
            <SelectSiteLicense
              defaultLicenseId={original.site_license_id}
              onChange={(site_license_id) => {
                console.log("select ", site_license_id);
                setEdited({ ...edited, site_license_id });
              }}
            />
          </EditRow>
        )}
        <EditRow
          label="Permission"
          description={
            <>
              An optional{" "}
              <A href="https://opensource.org/licenses">open source license</A>{" "}
              tells people how they may use what you are sharing.
            </>
          }
        >
          <License
            license={edited.license}
            onChange={(license) => setEdited({ ...edited, license })}
          />
        </EditRow>
        {/*TODO  Image: {edited.compute_image} */}
      </Space>
      {save}
    </div>
  );
}

function License({ license, onChange }) {
  const options: JSX.Element[] = [];
  for (const value in LICENSES) {
    options.push(
      <Option key={value} value={value}>
        {LICENSES[value]}
      </Option>
    );
  }
  return (
    <Select
      showSearch
      value={license}
      style={{ width: "100%" }}
      placeholder="Select an open source license"
      optionFilterProp="children"
      onChange={onChange}
      filterOption={(input, option) =>
        option?.children.toLowerCase().includes(input.toLowerCase())
      }
    >
      {options}
    </Select>
  );
}
