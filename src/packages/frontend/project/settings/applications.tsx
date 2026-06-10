/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input, Space, Switch, Typography } from "antd";

import { React, useMemo, useState } from "@cocalc/frontend/app-framework";
import { ErrorDisplay, SettingBox } from "@cocalc/frontend/components";
import {
  NO_EXT_PREFIX,
  canonical_extension,
  exact_filename_key,
} from "@cocalc/frontend/file-associations";
import { loadExtensionBundle } from "@cocalc/frontend/sdk/loader";
import {
  saveProjectSdkConfig,
  useProjectSdkConfig,
  type InstalledSdkBundle,
  type ProjectSdkConfig,
} from "@cocalc/frontend/sdk/project-config";
import { COLORS } from "@cocalc/util/theme";

const { Text } = Typography;
const APPLICATIONS_ICON = "wrench";

interface Props {
  project_id: string;
  mode?: "project" | "flyout";
}

type VerificationByUrl = Record<string, string>;
type MappingType = "extension" | "filename";

function getVerificationLabel(
  result: Awaited<ReturnType<typeof loadExtensionBundle>>,
): string {
  if (result.verification.mode === "signed") {
    return `Signed by ${
      result.verification.supplierName ?? result.verification.supplierId
    }`;
  }
  return "Dev mode (unsigned localhost)";
}

function getMappingKey(value: string, type: MappingType): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "";
  }
  if (type === "filename") {
    return trimmed.toLowerCase().startsWith(NO_EXT_PREFIX)
      ? canonical_extension(trimmed)
      : exact_filename_key(trimmed);
  }
  return canonical_extension(trimmed);
}

function renderMappingKey(fileKey: string): string {
  if (fileKey.startsWith(NO_EXT_PREFIX)) {
    return `Filename: ${fileKey.slice(NO_EXT_PREFIX.length)}`;
  }
  return `Extension: ${fileKey}`;
}

export const ProjectApplications: React.FC<Props> = ({
  project_id,
  mode = "project",
}: Props) => {
  const config = useProjectSdkConfig(project_id) ?? {};
  const isFlyout = mode === "flyout";
  const [bundleUrl, setBundleUrl] = useState("");
  const [mappingType, setMappingType] = useState<MappingType>("extension");
  const [mappingExt, setMappingExt] = useState("");
  const [mappingEditorId, setMappingEditorId] = useState("");
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [verification, setVerification] = useState<VerificationByUrl>({});

  const installed = config.installed ?? [];
  const fileMappings = config.file_mappings ?? {};

  React.useEffect(() => {
    let active = true;
    (async () => {
      const next: VerificationByUrl = {};
      for (const extension of installed) {
        if (extension.enabled === false) {
          continue;
        }
        try {
          const result = await loadExtensionBundle(extension.bundleUrl);
          next[extension.bundleUrl] = getVerificationLabel(result);
        } catch (err) {
          next[extension.bundleUrl] = `Load failed: ${err}`;
        }
      }
      if (active) {
        setVerification(next);
      }
    })();
    return () => {
      active = false;
    };
  }, [JSON.stringify(installed)]);

  const knownEditors = useMemo(() => {
    const ids = new Set<string>();
    for (const extension of installed) {
      ids.add(extension.id);
    }
    for (const editorId of Object.values(fileMappings)) {
      ids.add(editorId);
    }
    return [...ids].sort();
  }, [installed, fileMappings]);

  async function save(next: ProjectSdkConfig): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await saveProjectSdkConfig(project_id, next);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  }

  async function addExtension(): Promise<void> {
    const trimmed = bundleUrl.trim();
    if (trimmed === "") {
      setError("Enter an archive URL.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const loaded = await loadExtensionBundle(trimmed);
      const nextInstalled: InstalledSdkBundle[] = [
        ...installed.filter((extension) => extension.bundleUrl !== trimmed),
        {
          id: loaded.extension.id,
          bundleUrl: trimmed,
          enabled: true,
        },
      ];
      await saveProjectSdkConfig(project_id, {
        ...config,
        installed: nextInstalled,
      });
      setBundleUrl("");
      setVerification((current) => ({
        ...current,
        [trimmed]: getVerificationLabel(loaded),
      }));
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  }

  async function setInstalledEnabled(
    bundleUrl: string,
    enabled: boolean,
  ): Promise<void> {
    await save({
      ...config,
      installed: installed.map((extension) =>
        extension.bundleUrl === bundleUrl
          ? { ...extension, enabled }
          : extension,
      ),
    });
  }

  async function removeInstalled(bundleUrl: string): Promise<void> {
    const nextInstalled = installed.filter(
      (extension) => extension.bundleUrl !== bundleUrl,
    );
    const nextMappings = Object.fromEntries(
      Object.entries(fileMappings).filter(([, editorId]) => {
        return (
          installed.find(
            (extension) =>
              extension.bundleUrl === bundleUrl && extension.id === editorId,
          ) == null
        );
      }),
    );
    await save({
      ...config,
      installed: nextInstalled,
      file_mappings: nextMappings,
    });
  }

  async function addMapping(): Promise<void> {
    const ext = getMappingKey(mappingExt, mappingType);
    const editorId = mappingEditorId.trim();
    if (ext === "") {
      setError(
        mappingType === "filename"
          ? "Enter an exact filename."
          : "Enter a file extension.",
      );
      return;
    }
    if (editorId === "") {
      setError("Enter an editor id.");
      return;
    }
    await save({
      ...config,
      file_mappings: {
        ...fileMappings,
        [ext]: editorId,
      },
    });
    setMappingExt("");
    setMappingEditorId("");
  }

  async function removeMapping(ext: string): Promise<void> {
    const nextMappings = { ...fileMappings };
    delete nextMappings[ext];
    await save({
      ...config,
      file_mappings: nextMappings,
    });
  }

  function renderInstalled() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {installed.length === 0 ? (
          <Text type="secondary">No applications installed yet.</Text>
        ) : (
          installed.map((extension) => (
            <div
              key={extension.bundleUrl}
              style={{
                border: `1px solid ${COLORS.GRAY_L}`,
                borderRadius: "8px",
                padding: "10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div>
                    <Text strong>{extension.id}</Text>
                  </div>
                  <div>
                    <Text code>{extension.bundleUrl}</Text>
                  </div>
                  {verification[extension.bundleUrl] ? (
                    <div>
                      <Text type="secondary">
                        {verification[extension.bundleUrl]}
                      </Text>
                    </div>
                  ) : undefined}
                </div>
                <Space>
                  <Switch
                    checked={extension.enabled !== false}
                    checkedChildren="Enabled"
                    unCheckedChildren="Disabled"
                    onChange={(enabled) =>
                      void setInstalledEnabled(extension.bundleUrl, enabled)
                    }
                  />
                  <Button
                    danger
                    onClick={() => void removeInstalled(extension.bundleUrl)}
                  >
                    Remove
                  </Button>
                </Space>
              </div>
            </div>
          ))
        )}
        <Space.Compact style={{ width: "100%" }}>
          <Input
            value={bundleUrl}
            onChange={(event) => setBundleUrl(event.target.value)}
            placeholder="https://example.com/my-extension.zip"
          />
          <Button loading={saving} onClick={() => void addExtension()}>
            Add URL
          </Button>
        </Space.Compact>
      </div>
    );
  }

  function renderMappings() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {Object.keys(fileMappings).length === 0 ? (
          <Text type="secondary">No project editor overrides configured.</Text>
        ) : (
          Object.entries(fileMappings)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([ext, editorId]) => (
              <div
                key={ext}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <Text code>{renderMappingKey(ext)}</Text>
                  {" -> "}
                  <Text>{editorId}</Text>
                </div>
                <Button danger onClick={() => void removeMapping(ext)}>
                  Remove
                </Button>
              </div>
            ))
        )}
        <Space.Compact style={{ width: "100%" }}>
          <Button
            type={mappingType === "extension" ? "primary" : "default"}
            onClick={() => setMappingType("extension")}
          >
            Extension
          </Button>
          <Button
            type={mappingType === "filename" ? "primary" : "default"}
            onClick={() => setMappingType("filename")}
          >
            Filename
          </Button>
          <Input
            style={{ width: "30%" }}
            value={mappingExt}
            onChange={(event) => setMappingExt(event.target.value)}
            placeholder={mappingType === "filename" ? "Makefile" : "csv"}
          />
          <Input
            value={mappingEditorId}
            onChange={(event) => setMappingEditorId(event.target.value)}
            placeholder="my-org/csv-viewer"
            list={`applications-${project_id}`}
          />
          <Button loading={saving} onClick={() => void addMapping()}>
            Map
          </Button>
        </Space.Compact>
        <datalist id={`applications-${project_id}`}>
          {knownEditors.map((editorId) => (
            <option key={editorId} value={editorId} />
          ))}
        </datalist>
      </div>
    );
  }

  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      {error !== "" ? <ErrorDisplay banner error={error} /> : undefined}
      <Alert
        type="info"
        showIcon={false}
        message="Installed applications and extensions are stored in a shared conat DKV and apply to all collaborators."
      />
      <div>
        <Text strong>Installed Applications &amp; Extensions</Text>
        <div style={{ marginTop: "8px" }}>{renderInstalled()}</div>
      </div>
      <div>
        <Text strong>Default Editor Overrides</Text>
        <div style={{ marginTop: "8px" }}>{renderMappings()}</div>
      </div>
    </div>
  );

  if (isFlyout) {
    return content;
  }

  return (
    <SettingBox title="Applications" icon={APPLICATIONS_ICON as any}>
      {content}
    </SettingBox>
  );
};
