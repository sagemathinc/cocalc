import fs from "node:fs";
import path from "node:path";

export type SoftwareVersions = {
  project_host?: string;
  project_bundle?: string;
  tools?: string;
};

const DEFAULT_BUNDLE_ROOT = "/opt/cocalc/project-bundles";
const DEFAULT_TOOLS_CURRENT = "/opt/cocalc/tools/current";

function versionFromCurrentPath(currentPath: string): string | undefined {
  try {
    const realPath = fs.realpathSync(currentPath);
    const base = path.basename(realPath);
    if (base && base !== "current") {
      return base;
    }
  } catch {
    // ignore missing paths
  }
  return undefined;
}

function getProjectBundleVersion(): string | undefined {
  const bundlesRoot =
    process.env.COCALC_PROJECT_BUNDLES ?? DEFAULT_BUNDLE_ROOT;
  return versionFromCurrentPath(path.join(bundlesRoot, "current"));
}

function getToolsVersion(): string | undefined {
  const toolsPath =
    process.env.COCALC_PROJECT_TOOLS ?? DEFAULT_TOOLS_CURRENT;
  return versionFromCurrentPath(toolsPath);
}

function getProjectHostVersion(): string | undefined {
  return (
    process.env.COCALC_PROJECT_HOST_VERSION ??
    process.env.npm_package_version ??
    undefined
  );
}

export function getSoftwareVersions(): SoftwareVersions {
  return {
    project_host: getProjectHostVersion(),
    project_bundle: getProjectBundleVersion(),
    tools: getToolsVersion(),
  };
}
