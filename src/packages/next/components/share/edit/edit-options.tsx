/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useState } from "react";
import { join } from "path";
import { Button, Card, Checkbox, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import useCustomize from "lib/use-customize";
import OpenDirectly from "./open-directly";
import OpenAnonymously from "./open-anonymously";
import ChooseProject from "./choose-project";
import { Props } from "./index";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import { trunc_middle } from "@cocalc/util/misc";
import { WORKSPACE_LABEL, WORKSPACES_LABEL } from "@cocalc/util/i18n/terminology";

interface EditOptionsProps extends Props {
  onClose: () => void;
}

export default function EditOptions({
  id,
  path,
  url,
  relativePath,
  project_id,
  image,
  onClose,
  description,
  has_site_license,
}: EditOptionsProps) {
  const { isCollaborator } = useCustomize();
  const [everything, setEverything] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const { account } = useCustomize();
  return (
    <Card
      style={{ margin: "30px 0" }}
      title={
        <>
          <div style={{ float: "right", display: "flex" }}>
            {!(!url && isCollaborator) && (
              <div>
                <Tooltip
                  title={`When checked, additional files may be copied to your ${WORKSPACE_LABEL.toLowerCase()}, which uses more space but ensures everything works.`}
                >
                  <Checkbox
                    disabled={copied}
                    checked={everything}
                    onChange={(e) => setEverything(e.target.checked)}
                  >
                    Copy Everything
                  </Checkbox>
                </Tooltip>
              </div>
            )}
            <Button
              type="text"
              onClick={onClose}
              style={{ marginLeft: "30px" }}
            >
              <Icon name="times" />
            </Button>
          </div>
          <Icon style={{ marginRight: "10px" }} name="pencil" /> Edit{" "}
          <b>{trunc_middle(join(path, relativePath), 60)}</b>
        </>
      }
    >
      {account?.account_id != null && (
        <SignedInOptions
          id={id}
          path={path}
          url={url}
          relativePath={relativePath}
          everything={everything}
          project_id={project_id}
          image={image}
          description={description}
          isCollaborator={isCollaborator}
          onCopied={() => setCopied(true)}
        />
      )}
      {account?.account_id == null && (
        <NotSignedInOptions
          path={path}
          has_site_license={has_site_license}
          id={id}
        />
      )}
      <br />
    </Card>
  );
}

function SignedInOptions({
  id,
  path,
  url,
  relativePath,
  project_id,
  image,
  description,
  everything,
  isCollaborator,
  onCopied,
}) {
  return !url && isCollaborator ? (
    <OpenDirectly
      id={id}
      project_id={project_id}
      path={path}
      relativePath={relativePath}
    />
  ) : (
    <ChooseProject
      id={id}
      src_project_id={project_id}
      path={path}
      url={url}
      relativePath={relativePath}
      everything={everything}
      image={image}
      description={description ? description : path ? path : relativePath}
      onCopied={onCopied}
    />
  );
}

function NotSignedInOptions({ path, has_site_license, id }) {
  const { anonymousSignup, anonymousSignupLicensedShares } = useCustomize();
  return (
    <div>
      <InPlaceSignInOrUp
        title={`Choose ${WORKSPACE_LABEL}`}
        why={`to edit in one of your own ${
          has_site_license ? "licensed" : ""
        } ${WORKSPACES_LABEL.toLowerCase()} using a full collaborative ${
          path?.endsWith("ipynb") ? "Jupyter notebook" : "editor"
        }`}
        publicPathId={has_site_license ? id : undefined}
      />
      {anonymousSignup && <OpenAnonymously />}
      {!anonymousSignup &&
        anonymousSignupLicensedShares &&
        has_site_license && <OpenAnonymously publicPathId={id} />}
    </div>
  );
}
