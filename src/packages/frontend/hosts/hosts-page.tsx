import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Form,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import {
  React,
  useEffect,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import Bootlog from "@cocalc/frontend/project/bootlog";
import type { Host, HostCatalog } from "@cocalc/conat/hub/api/hosts";
import { getMachineTypeArchitecture } from "@cocalc/util/db-schema/compute-servers";
import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import type { HostProvider, HostRecommendation } from "./types";
import {
  extractJsonPayload,
  normalizeRecommendation,
} from "./utils/recommendations";
import { HostAiAssist } from "./components/host-ai-assist";
import { HostCreateForm } from "./components/host-create-form";
import {
  LAMBDA_REGIONS,
  PROVIDERS,
  REGIONS,
  SIZES,
  STATUS_COLOR,
  WRAP_STYLE,
} from "./constants";



function imageVersionCode(name: string): number | undefined {
  const match = name.match(/ubuntu-.*?(\d{2})(\d{2})/i);
  if (!match) return undefined;
  return Number(`${match[1]}${match[2]}`);
}

export const HostsPage: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Host | undefined>(undefined);
  const [hostLog, setHostLog] = useState<
    {
      id: string;
      ts?: string | null;
      action: string;
      status: string;
      provider?: string | null;
      error?: string | null;
    }[]
  >([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [canCreateHosts, setCanCreateHosts] = useState<boolean>(true);
  const [catalog, setCatalog] = useState<HostCatalog | undefined>(undefined);
  const [catalogError, setCatalogError] = useState<string | undefined>(
    undefined,
  );
  const [catalogRefreshing, setCatalogRefreshing] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBudget, setAiBudget] = useState<number | undefined>(undefined);
  const [aiRegionGroup, setAiRegionGroup] = useState<string>("any");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | undefined>(undefined);
  const [aiResults, setAiResults] = useState<HostRecommendation[]>([]);
  const [llmModel] = useLanguageModelSetting();
  const [refreshProvider, setRefreshProvider] = useState<HostProvider>("gcp");
  const hub = webapp_client.conat_client.hub;
  const [form] = Form.useForm();
  const isAdmin = useTypedRedux("account", "is_admin");
  const gcpEnabled = useTypedRedux(
    "customize",
    "compute_servers_google-cloud_enabled",
  );
  const hyperstackEnabled = useTypedRedux(
    "customize",
    "compute_servers_hyperstack_enabled",
  );
  const lambdaEnabled = useTypedRedux(
    "customize",
    "compute_servers_lambda_enabled",
  );
  const nebiusEnabled = useTypedRedux(
    "customize",
    "project_hosts_nebius_enabled",
  );
  const showLocal =
    typeof window !== "undefined" && window.location.hostname === "localhost";

  const providerOptions = useMemo(() => {
    return PROVIDERS.filter((opt) => {
      if (opt.value === "gcp") return !!gcpEnabled;
      if (opt.value === "hyperstack") return !!hyperstackEnabled;
      if (opt.value === "lambda") return !!lambdaEnabled;
      if (opt.value === "nebius") return !!nebiusEnabled;
      if (opt.value === "none") return showLocal;
      return false;
    });
  }, [gcpEnabled, hyperstackEnabled, lambdaEnabled, nebiusEnabled, showLocal]);

  const refreshProviders = useMemo(() => {
    const opts: Array<{ value: HostProvider; label: string }> = [];
    if (gcpEnabled) opts.push({ value: "gcp", label: "GCP" });
    if (hyperstackEnabled)
      opts.push({ value: "hyperstack", label: "Hyperstack" });
    if (lambdaEnabled) opts.push({ value: "lambda", label: "Lambda Cloud" });
    if (nebiusEnabled) opts.push({ value: "nebius", label: "Nebius" });
    return opts;
  }, [gcpEnabled, hyperstackEnabled, lambdaEnabled, nebiusEnabled, isAdmin]);

  useEffect(() => {
    const current = form.getFieldValue("provider") as HostProvider | undefined;
    if (current === "gcp" && !gcpEnabled) {
      form.setFieldsValue({ provider: "none" });
    } else if (current === "hyperstack" && !hyperstackEnabled) {
      form.setFieldsValue({ provider: "none" });
    } else if (current === "lambda" && !lambdaEnabled) {
      form.setFieldsValue({ provider: "none" });
    } else if (current === "nebius" && !nebiusEnabled) {
      form.setFieldsValue({ provider: "none" });
    } else if (!current) {
      form.setFieldsValue({ provider: providerOptions[0]?.value ?? "none" });
    }
  }, [
    gcpEnabled,
    hyperstackEnabled,
    lambdaEnabled,
    nebiusEnabled,
    providerOptions,
    form,
  ]);

  const selectedProvider = Form.useWatch("provider", form);
  const selectedRegion = Form.useWatch("region", form);
  const selectedZone = Form.useWatch("zone", form);
  const selectedMachineType = Form.useWatch("machine_type", form);
  const selectedGpuType = Form.useWatch("gpu_type", form);
  const selectedSourceImage = Form.useWatch("source_image", form);
  const selectedSize = Form.useWatch("size", form);
  const selectedStorageMode = Form.useWatch("storage_mode", form);
  const providerCaps = useMemo(() => {
    if (!selectedProvider || !catalog?.provider_capabilities) return undefined;
    return catalog.provider_capabilities[selectedProvider];
  }, [catalog, selectedProvider]);
  const supportsPersistentStorage =
    providerCaps?.persistentStorage?.supported ?? selectedProvider !== "lambda";
  const persistentGrowable = providerCaps?.persistentStorage?.growable ?? true;
  const storageModeOptions = supportsPersistentStorage
    ? [
        { value: "ephemeral", label: "Ephemeral (local)" },
        {
          value: "persistent",
          label: persistentGrowable
            ? "Persistent (growable disk)"
            : "Persistent (fixed size)",
        },
      ]
    : [{ value: "ephemeral", label: "Ephemeral (local)" }];
  const showDiskFields =
    supportsPersistentStorage && selectedStorageMode !== "ephemeral";

  useEffect(() => {
    if (refreshProvider === "gcp" && !gcpEnabled) {
      setRefreshProvider(
        hyperstackEnabled
          ? "hyperstack"
          : lambdaEnabled
            ? "lambda"
            : nebiusEnabled
              ? "nebius"
              : "gcp",
      );
    } else if (refreshProvider === "hyperstack" && !hyperstackEnabled) {
      setRefreshProvider(
        gcpEnabled
          ? "gcp"
          : lambdaEnabled
            ? "lambda"
            : nebiusEnabled
              ? "nebius"
              : "hyperstack",
      );
    } else if (refreshProvider === "lambda" && !lambdaEnabled) {
      setRefreshProvider(
        gcpEnabled
          ? "gcp"
          : hyperstackEnabled
            ? "hyperstack"
            : nebiusEnabled
              ? "nebius"
              : "lambda",
      );
    } else if (refreshProvider === "nebius" && !nebiusEnabled) {
      setRefreshProvider(
        gcpEnabled
          ? "gcp"
          : hyperstackEnabled
            ? "hyperstack"
            : lambdaEnabled
              ? "lambda"
              : "nebius",
      );
    }
  }, [
    refreshProvider,
    gcpEnabled,
    hyperstackEnabled,
    lambdaEnabled,
    nebiusEnabled,
  ]);

  useEffect(() => {
    if (!supportsPersistentStorage) {
      form.setFieldsValue({ storage_mode: "ephemeral" });
    } else if (!form.getFieldValue("storage_mode")) {
      form.setFieldsValue({ storage_mode: "persistent" });
    }
  }, [supportsPersistentStorage, form]);

  const refresh = async () => {
    const [list, membership] = await Promise.all([
      hub.hosts.listHosts({}),
      hub.purchases.getMembership({}),
    ]);
    setHosts(list);
    setCanCreateHosts(
      membership?.entitlements?.features?.create_hosts === true,
    );
    if (selected) {
      const updated = list.find((h) => h.id === selected.id);
      setSelected(updated);
    }
  };

  useEffect(() => {
    refresh().catch((err) => {
      console.error("failed to load hosts", err);
      message.error("Unable to load hosts");
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!selected?.id || !drawerOpen) {
      if (!drawerOpen) setHostLog([]);
      return;
    }
    setLoadingLog(true);
    (async () => {
      try {
        const entries = await hub.hosts.getHostLog({
          id: selected.id,
          limit: 50,
        });
        if (mounted) setHostLog(entries);
      } catch (err) {
        if (mounted) setHostLog([]);
        console.warn("getHostLog failed", err);
      } finally {
        if (mounted) setLoadingLog(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selected?.id, drawerOpen, hub.hosts]);

  useEffect(() => {
    const providerForCatalog: HostProvider | undefined =
      selectedProvider === "gcp"
        ? "gcp"
        : selectedProvider === "hyperstack"
          ? "hyperstack"
          : selectedProvider === "lambda"
            ? "lambda"
            : selectedProvider === "nebius"
              ? "nebius"
              : gcpEnabled
                ? "gcp"
                : hyperstackEnabled
                  ? "hyperstack"
                  : lambdaEnabled
                    ? "lambda"
                    : nebiusEnabled
                      ? "nebius"
                      : undefined;
    if (!providerForCatalog) {
      setCatalog(undefined);
      setCatalogError(undefined);
      return;
    }
    const loadCatalog = async () => {
      try {
        const data = await hub.hosts.getCatalog({
          provider: providerForCatalog,
        });
        setCatalog(data);
        setCatalogError(undefined);
      } catch (err: any) {
        console.error("failed to load cloud catalog", err);
        setCatalog(undefined);
        setCatalogError(
          err?.message ?? "Unable to load cloud catalog (regions/zones).",
        );
      }
    };
    loadCatalog().catch((err) => console.error("catalog refresh failed", err));
  }, [
    selectedProvider,
    gcpEnabled,
    hyperstackEnabled,
    lambdaEnabled,
    nebiusEnabled,
    hub.hosts,
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      refresh().catch((err) => console.error("host refresh failed", err));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const hyperstackRegionOptions = catalog?.hyperstack_regions?.length
    ? catalog.hyperstack_regions.map((r) => ({
        value: r.name,
        label: r.name,
      }))
    : [];

  const lambdaInstanceTypeOptions =
    selectedProvider === "lambda" && catalog?.lambda_instance_types?.length
      ? catalog.lambda_instance_types
          .filter((entry) => !!entry?.name)
          .map((entry) => {
            const cpuLabel = entry.vcpus != null ? String(entry.vcpus) : "?";
            const ramLabel =
              entry.memory_gib != null ? String(entry.memory_gib) : "?";
            const gpuLabel =
              entry.gpus && entry.gpus > 0 ? ` · ${entry.gpus}x GPU` : "";
            const regionsCount = entry.regions?.length ?? 0;
            const regionsLabel = regionsCount
              ? ` · ${regionsCount} regions`
              : "";
            const hasRegions = regionsCount > 0;
            return {
              value: entry.name,
              label: `${entry.name} (${cpuLabel} vCPU / ${ramLabel} GB${gpuLabel}${regionsLabel})`,
              entry,
              hasRegions,
              disabled: !hasRegions,
            };
          })
          .sort((a, b) => {
            if (a.hasRegions !== b.hasRegions) {
              return a.hasRegions ? -1 : 1;
            }
            return a.value.localeCompare(b.value);
          })
      : [];

  const nebiusInstanceTypeOptions =
    selectedProvider === "nebius" && catalog?.nebius_instance_types?.length
      ? catalog.nebius_instance_types
          .filter((entry) => !!entry?.name)
          .map((entry) => {
            const cpuLabel = entry.vcpus != null ? String(entry.vcpus) : "?";
            const ramLabel =
              entry.memory_gib != null ? String(entry.memory_gib) : "?";
            const gpuLabel =
              entry.gpus && entry.gpus > 0
                ? ` · ${entry.gpus}x ${entry.gpu_label ?? "GPU"}`
                : "";
            const platformLabel = entry.platform_label
              ? ` · ${entry.platform_label}`
              : "";
            return {
              value: entry.name,
              label: `${entry.name} (${cpuLabel} vCPU / ${ramLabel} GB${gpuLabel}${platformLabel})`,
              entry,
            };
          })
          .sort((a, b) => a.value.localeCompare(b.value))
      : [];

  const selectedLambdaInstanceType =
    selectedProvider === "lambda"
      ? lambdaInstanceTypeOptions.find(
          (opt) => opt.value === selectedMachineType,
        )?.entry
      : undefined;

  const lambdaRegionsFromCatalog = catalog?.lambda_regions?.length
    ? catalog.lambda_regions.map((r) => r.name).filter(Boolean)
    : catalog?.lambda_instance_types?.length
      ? Array.from(
          new Set(
            catalog.lambda_instance_types.flatMap(
              (entry) => entry.regions ?? [],
            ),
          ),
        )
      : [];

  const lambdaRegionOptions =
    selectedProvider === "lambda"
      ? (selectedLambdaInstanceType?.regions?.length
          ? selectedLambdaInstanceType.regions
          : lambdaRegionsFromCatalog.length
            ? lambdaRegionsFromCatalog
            : LAMBDA_REGIONS.map((r) => r.value)
        ).map((name) => ({ value: name, label: name }))
      : [];

  const nebiusRegionOptions = catalog?.nebius_regions?.length
    ? catalog.nebius_regions.map((r) => ({ value: r.name, label: r.name }))
    : [];

  const regionOptions =
    selectedProvider === "hyperstack" && hyperstackRegionOptions.length
      ? hyperstackRegionOptions
      : selectedProvider === "lambda"
        ? lambdaRegionOptions
        : selectedProvider === "nebius" && nebiusRegionOptions.length
          ? nebiusRegionOptions
          : selectedProvider === "gcp" && catalog?.regions?.length
            ? catalog.regions.map((r) => {
                const zoneWithMeta = catalog.zones?.find(
                  (z) => z.region === r.name && (z.location || z.lowC02),
                );
                const location = zoneWithMeta?.location;
                const lowC02 = zoneWithMeta?.lowC02 ? " (low CO₂)" : "";
                const suffix = location ? ` — ${location}${lowC02}` : "";
                return { value: r.name, label: `${r.name}${suffix}` };
              })
            : REGIONS;

  useEffect(() => {
    if (!selectedProvider || selectedProvider === "none") return;
    if (selectedProvider === "local") return;
    if (!regionOptions.length) return;
    const values = new Set(regionOptions.map((r) => r.value));
    if (selectedRegion && values.has(selectedRegion)) return;
    form.setFieldsValue({ region: regionOptions[0].value });
  }, [selectedProvider, regionOptions, selectedRegion, form]);

  const zoneOptions =
    selectedProvider === "gcp" && catalog?.regions?.length
      ? (
          catalog.regions.find((r) => r.name === selectedRegion)?.zones ?? []
        ).map((z) => {
          const meta = catalog.zones?.find((zone) => zone.name === z);
          const suffix = meta?.location ? ` — ${meta.location}` : "";
          const lowC02 = meta?.lowC02 ? " (low CO₂)" : "";
          return { value: z, label: `${z}${suffix}${lowC02}` };
        })
      : [];

  const machineTypeOptions =
    selectedProvider === "gcp" && selectedZone && catalog?.machine_types_by_zone
      ? (catalog.machine_types_by_zone[selectedZone] ?? []).map((mt) => ({
          value: mt.name ?? "",
          label: mt.name ?? "unknown",
        }))
      : [];

  const hyperstackFlavorOptions =
    selectedProvider === "hyperstack" && catalog?.hyperstack_flavors?.length
      ? catalog.hyperstack_flavors
          .filter((flavor) => flavor.region_name === selectedRegion)
          .map((flavor) => {
            const cpuLabel = flavor.cpu != null ? String(flavor.cpu) : "?";
            const ramLabel = flavor.ram != null ? String(flavor.ram) : "?";
            const gpuLabel =
              flavor.gpu_count && flavor.gpu && flavor.gpu !== "none"
                ? ` · ${flavor.gpu_count}x ${flavor.gpu}`
                : "";
            const label = `${flavor.name} (${cpuLabel} vCPU / ${ramLabel} GB${gpuLabel})`;
            return { value: flavor.name, label, flavor };
          })
      : [];

  const gpuTypeOptions =
    selectedProvider === "gcp" && selectedZone && catalog?.gpu_types_by_zone
      ? (catalog.gpu_types_by_zone[selectedZone] ?? []).map((gt) => ({
          value: gt.name ?? "",
          label: gt.name ?? "unknown",
        }))
      : [];

  const wantsGpu =
    selectedProvider === "gcp" &&
    !!selectedGpuType &&
    selectedGpuType !== "none";

  const imageOptions =
    selectedProvider === "gcp" && catalog?.images?.length
      ? [...catalog.images]
          .filter((img) => {
            if (!selectedMachineType) {
              const imgArch = (img.architecture ?? "").toUpperCase();
              return imgArch ? imgArch === "X86_64" : true;
            }
            const arch = getMachineTypeArchitecture(selectedMachineType);
            const imgArch = (img.architecture ?? "").toUpperCase();
            if (!imgArch) return true;
            return arch === "arm64"
              ? imgArch === "ARM64"
              : imgArch === "X86_64";
          })
          .filter((img) =>
            wantsGpu ? img.gpuReady === true : img.gpuReady !== true,
          )
          .sort((a, b) => {
            const va = imageVersionCode(a.family ?? a.name ?? "");
            const vb = imageVersionCode(b.family ?? b.name ?? "");
            if (va != null && vb != null && va !== vb) {
              return vb - va;
            }
            const ta = Date.parse(a.creationTimestamp ?? "");
            const tb = Date.parse(b.creationTimestamp ?? "");
            if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
            if (!Number.isFinite(ta)) return 1;
            if (!Number.isFinite(tb)) return -1;
            return tb - ta;
          })
          .map((img) => {
            const label = img.family
              ? `${img.family}${img.gpuReady ? " (GPU-ready)" : ""}`
              : (img.name ?? "unknown");
            const archSuffix = img.architecture
              ? ` [${img.architecture.toUpperCase()}]`
              : "";
            return {
              value: img.selfLink ?? img.name ?? "",
              label: `${label}${archSuffix}`,
            };
          })
      : [];

  const catalogSummary = useMemo(() => {
    if (!catalog) return undefined;
    const limit = <T,>(items: T[], n = 5) => items.slice(0, n);
    const zonesByName = new Map(catalog.zones?.map((z) => [z.name, z]) ?? []);
    const regionGroups: Record<string, string[]> = {};
    const gcpRegions = (catalog.regions ?? []).map((r) => {
      const zone = r.zones?.[0];
      const zoneDetails = zone ? zonesByName.get(zone) : undefined;
      const machineTypes = limit(
        catalog.machine_types_by_zone?.[zone ?? ""] ?? [],
        5,
      ).map((m) => ({
        name: m.name,
        guestCpus: m.guestCpus,
        memoryMb: m.memoryMb,
      }));
      const gpuTypes = limit(
        catalog.gpu_types_by_zone?.[zone ?? ""] ?? [],
        5,
      ).map((g) => ({
        name: g.name,
        description: g.description,
        maximumCardsPerInstance: g.maximumCardsPerInstance,
      }));
      return {
        name: r.name,
        location: zoneDetails?.location,
        lowC02: zoneDetails?.lowC02,
        zones: limit(r.zones ?? [], 3),
        sampleMachineTypes: machineTypes,
        sampleGpuTypes: gpuTypes,
      };
    });
    for (const r of gcpRegions) {
      const name = r.name || "";
      let group = "any";
      if (name.startsWith("us-west")) group = "us-west";
      else if (name.startsWith("us-east")) group = "us-east";
      else if (name.startsWith("europe")) group = "eu-west";
      else if (name.startsWith("asia")) group = "asia";
      else if (name.startsWith("australia")) group = "australia";
      else if (name.startsWith("southamerica")) group = "southamerica";
      regionGroups[group] ??= [];
      regionGroups[group].push(name);
    }
    const gcpImages = limit(catalog.images ?? [], 6).map((img) => ({
      name: img.name,
      family: img.family,
      selfLink: img.selfLink,
      architecture: img.architecture,
      gpuReady: img.gpuReady,
    }));
    const hyperstackRegions = catalog.hyperstack_regions ?? [];
    const hyperstackFlavors = limit(catalog.hyperstack_flavors ?? [], 10).map(
      (f) => ({
        name: f.name,
        region: f.region_name,
        cpu: f.cpu,
        ram: f.ram,
        gpu: f.gpu,
        gpu_count: f.gpu_count,
      }),
    );
    const lambdaRegions = catalog.lambda_regions?.length
      ? catalog.lambda_regions
      : lambdaRegionsFromCatalog.length
        ? lambdaRegionsFromCatalog.map((name) => ({ name }))
        : LAMBDA_REGIONS.map((r) => ({ name: r.value }));
    const lambdaInstanceTypes = limit(
      catalog.lambda_instance_types ?? [],
      25,
    ).map((entry) => ({
      name: entry.name,
      vcpus: entry.vcpus,
      memory_gib: entry.memory_gib,
      gpus: entry.gpus,
      regions: entry.regions,
    }));
    const lambdaImages = limit(catalog.lambda_images ?? [], 10).map((img) => ({
      id: img.id,
      name: img.name,
      family: img.family,
      architecture: img.architecture,
      region: img.region,
    }));
    const nebiusRegions = catalog.nebius_regions ?? [];
    const nebiusInstanceTypes = limit(
      catalog.nebius_instance_types ?? [],
      25,
    ).map((entry) => ({
      name: entry.name,
      platform: entry.platform,
      platform_label: entry.platform_label,
      vcpus: entry.vcpus,
      memory_gib: entry.memory_gib,
      gpus: entry.gpus,
      gpu_label: entry.gpu_label,
    }));
    const nebiusImages = limit(catalog.nebius_images ?? [], 10).map((img) => ({
      id: img.id,
      name: img.name,
      family: img.family,
      version: img.version,
      architecture: img.architecture,
      recommended_platforms: img.recommended_platforms,
    }));
    return {
      gcp: {
        regions: gcpRegions,
        region_groups: regionGroups,
        images: gcpImages,
      },
      hyperstack: {
        regions: hyperstackRegions,
        flavors: hyperstackFlavors,
      },
      ...(lambdaEnabled
        ? {
            lambda: {
              regions: lambdaRegions,
              instance_types: lambdaInstanceTypes,
              images: lambdaImages,
            },
          }
        : {}),
      ...(catalog.nebius_regions?.length || catalog.nebius_instance_types?.length
        ? {
            nebius: {
              regions: nebiusRegions,
              instance_types: nebiusInstanceTypes,
              images: nebiusImages,
            },
          }
        : {}),
    };
  }, [catalog, lambdaEnabled]);

  useEffect(() => {
    if (selectedProvider !== "gcp") return;
    if (!imageOptions.length) return;
    const values = new Set(imageOptions.map((img) => img.value));
    if (selectedSourceImage && values.has(selectedSourceImage)) return;
    // Reset to a compatible default if the current selection is missing or invalid.
    form.setFieldsValue({ source_image: imageOptions[0].value });
  }, [selectedProvider, selectedSourceImage, imageOptions, form]);

  useEffect(() => {
    if (selectedProvider !== "gcp") return;
    if (!zoneOptions.length) return;
    if (selectedZone && zoneOptions.some((z) => z.value === selectedZone)) {
      return;
    }
    form.setFieldsValue({ zone: zoneOptions[0].value });
  }, [selectedProvider, selectedRegion, zoneOptions, selectedZone, form]);

  useEffect(() => {
    if (selectedProvider !== "lambda") return;
    if (!lambdaInstanceTypeOptions.length) return;
    const values = new Set(lambdaInstanceTypeOptions.map((opt) => opt.value));
    if (selectedMachineType && values.has(selectedMachineType)) {
      const selectedOption = lambdaInstanceTypeOptions.find(
        (opt) => opt.value === selectedMachineType,
      );
      if (!selectedOption?.disabled) return;
    }
    const preferred =
      lambdaInstanceTypeOptions.find((opt) => !opt.disabled) ??
      lambdaInstanceTypeOptions[0];
    if (preferred) {
      form.setFieldsValue({ machine_type: preferred.value });
    }
  }, [selectedProvider, lambdaInstanceTypeOptions, selectedMachineType, form]);

  useEffect(() => {
    if (selectedProvider !== "nebius") return;
    if (!nebiusInstanceTypeOptions.length) return;
    const values = new Set(nebiusInstanceTypeOptions.map((opt) => opt.value));
    if (selectedMachineType && values.has(selectedMachineType)) return;
    form.setFieldsValue({ machine_type: nebiusInstanceTypeOptions[0].value });
  }, [selectedProvider, nebiusInstanceTypeOptions, selectedMachineType, form]);

  useEffect(() => {
    if (selectedProvider !== "gcp") return;
    if (!machineTypeOptions.length) return;
    if (
      selectedMachineType &&
      machineTypeOptions.some((mt) => mt.value === selectedMachineType)
    ) {
      return;
    }
    form.setFieldsValue({ machine_type: machineTypeOptions[0].value });
  }, [
    selectedProvider,
    selectedZone,
    machineTypeOptions,
    selectedMachineType,
    form,
  ]);

  useEffect(() => {
    if (selectedProvider !== "hyperstack") return;
    if (!hyperstackFlavorOptions.length) return;
    const values = new Set(hyperstackFlavorOptions.map((opt) => opt.value));
    if (selectedSize && values.has(selectedSize)) return;
    form.setFieldsValue({ size: hyperstackFlavorOptions[0].value });
  }, [selectedProvider, hyperstackFlavorOptions, selectedSize, form]);

  const applyRecommendation = (rec: HostRecommendation) => {
    if (!rec.provider) return;
    const next: Record<string, any> = { provider: rec.provider };
    if (rec.provider === "gcp") {
      if (rec.region) next.region = rec.region;
      if (rec.zone) next.zone = rec.zone;
      if (rec.machine_type) next.machine_type = rec.machine_type;
      if (rec.gpu_type) next.gpu_type = rec.gpu_type;
      if (rec.source_image) next.source_image = rec.source_image;
    } else if (rec.provider === "hyperstack") {
      if (rec.region) next.region = rec.region;
      if (rec.flavor) next.size = rec.flavor;
    } else if (rec.provider === "lambda") {
      if (rec.region) next.region = rec.region;
      if (rec.machine_type) next.machine_type = rec.machine_type;
    } else if (rec.provider === "nebius") {
      if (rec.region) next.region = rec.region;
      if (rec.machine_type) next.machine_type = rec.machine_type;
    }
    if (rec.disk_gb) next.disk = rec.disk_gb;
    form.setFieldsValue(next);
  };

  const runAiRecommendation = async () => {
    if (!aiPrompt.trim()) {
      setAiError("Tell us what you want to run.");
      return;
    }
    setAiError(undefined);
    setAiLoading(true);
    try {
      const system =
        "You recommend cloud host configs. Return only valid JSON. " +
        "Always respond with an object that has a single key named options " +
        "whose value is an array of recommendation objects. " +
        "Each option must choose provider/region/machine/flavor/image from the provided catalog. " +
        "Use the region_group preference to select a region from catalog.gcp.region_groups when possible. " +
        "If the requested group has no regions, choose the closest available region and explain why. " +
        "Do not claim a region is missing; always pick the best available from the catalog. " +
        "If multiple providers are available, include options for more than one unless the user explicitly requests a single provider.";
      const input = JSON.stringify({
        request: aiPrompt.trim(),
        budget_usd_per_hour: aiBudget ?? null,
        region_group: aiRegionGroup,
        catalog: catalogSummary,
        providers_available: Object.keys(catalogSummary ?? {}),
        output_format: {
          options: [
            {
              title: "string",
              provider: "gcp|hyperstack|lambda|nebius",
              region: "string",
              zone: "string?",
              machine_type: "string?",
              flavor: "string?",
              gpu_type: "string?",
              gpu_count: "number?",
              disk_gb: "number?",
              source_image: "string?",
              rationale: "string",
              est_cost_per_hour: "number?",
            },
          ],
        },
      });
      const reply = await webapp_client.openai_client.query({
        input,
        system,
        model: llmModel,
        tag: "host_recommendation",
      });
      const parsed = extractJsonPayload(reply);
      const rawOptions: any[] = Array.isArray(parsed?.options)
        ? parsed.options
        : Array.isArray(parsed)
          ? parsed
          : [];
      const options = rawOptions
        .map((opt) => normalizeRecommendation(opt))
        .filter((opt): opt is HostRecommendation => !!opt);
      if (!options.length) {
        console.warn("recommendation empty response", reply);
        throw new Error("No recommendations returned");
      }
      setAiResults(options.slice(0, 3));
    } catch (err) {
      console.error("recommendation failed", err);
      setAiError("Unable to generate recommendations right now.");
    } finally {
      setAiLoading(false);
    }
  };

  const onCreate = async (vals: any) => {
    if (creating) return;
    setCreating(true);
    try {
      const machine_type = vals.machine_type || undefined;
      const gpu_type =
        vals.gpu_type && vals.gpu_type !== "none" ? vals.gpu_type : undefined;
      const hyperstackFlavor = hyperstackFlavorOptions.find(
        (opt) => opt.value === vals.size,
      )?.flavor;
      const hyperstackGpuType =
        hyperstackFlavor && hyperstackFlavor.gpu !== "none"
          ? hyperstackFlavor.gpu
          : undefined;
      const hyperstackGpuCount = hyperstackFlavor?.gpu_count || 0;
      const lambdaInstanceType = lambdaInstanceTypeOptions.find(
        (opt) => opt.value === vals.machine_type,
      )?.entry;
      const lambdaGpuCount = lambdaInstanceType?.gpus ?? 0;
      const nebiusInstanceType = nebiusInstanceTypeOptions.find(
        (opt) => opt.value === vals.machine_type,
      )?.entry;
      const nebiusGpuCount = nebiusInstanceType?.gpus ?? 0;
      const genericGpuType =
        vals.gpu && vals.gpu !== "none" ? vals.gpu : undefined;
      const wantsGpu =
        vals.provider === "hyperstack"
          ? hyperstackGpuCount > 0
          : vals.provider === "gcp"
            ? !!gpu_type
            : vals.provider === "lambda"
              ? lambdaGpuCount > 0
              : vals.provider === "nebius"
                ? nebiusGpuCount > 0
              : !!genericGpuType;
      const storage_mode =
        vals.provider === "lambda"
          ? "ephemeral"
          : vals.storage_mode || "persistent";
      const defaultRegion =
        vals.provider === "hyperstack"
          ? hyperstackRegionOptions[0]?.value
          : vals.provider === "lambda"
            ? (lambdaRegionOptions[0]?.value ?? LAMBDA_REGIONS[0]?.value)
            : vals.provider === "nebius"
              ? nebiusRegionOptions[0]?.value
            : "us-east1";
      await hub.hosts.createHost({
        name: vals.name ?? "My Host",
        region: vals.region ?? defaultRegion,
        size: machine_type ?? vals.size ?? SIZES[0].value,
        gpu: wantsGpu,
        machine: {
          cloud: vals.provider !== "none" ? vals.provider : undefined,
          machine_type:
            vals.provider === "hyperstack"
              ? hyperstackFlavor?.name
              : vals.provider === "nebius"
                ? nebiusInstanceType?.name
                : machine_type,
          gpu_type:
            vals.provider === "hyperstack"
              ? hyperstackGpuType
              : vals.provider === "gcp"
                ? gpu_type
                : vals.provider === "lambda"
                  ? undefined
                  : vals.provider === "nebius"
                    ? nebiusInstanceType?.gpu_label
                  : genericGpuType,
          gpu_count:
            vals.provider === "hyperstack"
              ? hyperstackGpuCount || undefined
              : vals.provider === "gcp"
                ? gpu_type
                  ? 1
                  : undefined
                : vals.provider === "lambda"
                  ? lambdaGpuCount || undefined
                  : vals.provider === "nebius"
                    ? nebiusGpuCount || undefined
                  : genericGpuType
                    ? 1
                    : undefined,
          zone: vals.provider === "gcp" ? (vals.zone ?? undefined) : undefined,
          storage_mode,
          disk_gb: vals.disk,
          disk_type: vals.disk_type,
          source_image: vals.source_image || undefined,
          metadata: {
            shared: vals.shared,
            bucket: vals.bucket,
            boot_disk_gb: vals.boot_disk_gb,
          },
        },
      });
      await refresh();
      message.success("Host created");
    } catch (err) {
      console.error(err);
      message.error("Failed to create host");
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (id: string, action: "start" | "stop") => {
    try {
      setHosts((prev) =>
        prev.map((h) =>
          h.id === id
            ? { ...h, status: action === "start" ? "starting" : "stopping" }
            : h,
        ),
      );
      if (action === "start") {
        await hub.hosts.startHost({ id });
      } else {
        await hub.hosts.stopHost({ id });
      }
    } catch (err) {
      console.error(err);
      message.error(`Failed to ${action} host`);
      return;
    }
    try {
      await refresh();
    } catch (err) {
      console.error("host refresh failed", err);
    }
  };

  const removeHost = async (id: string) => {
    try {
      await hub.hosts.deleteHost({ id });
      await refresh();
    } catch (err) {
      console.error(err);
      message.error("Failed to delete host");
    }
  };

  const refreshCatalog = async () => {
    if (catalogRefreshing) return;
    setCatalogRefreshing(true);
    try {
      await hub.hosts.updateCloudCatalog({ provider: refreshProvider });
      if (refreshProvider === selectedProvider) {
        const data = await hub.hosts.getCatalog({
          provider: refreshProvider,
        });
        setCatalog(data);
        setCatalogError(undefined);
      }
      message.success("Cloud catalog updated");
    } catch (err) {
      console.error(err);
      message.error("Failed to update cloud catalog");
    } finally {
      setCatalogRefreshing(false);
    }
  };

  const content = useMemo(() => {
    if (hosts.length === 0) {
      return (
        <Card
          style={{ maxWidth: 720, margin: "0 auto" }}
          title={
            <span>
              <Icon name="server" /> Project Hosts
            </span>
          }
        >
          <Typography.Paragraph>
            Dedicated project hosts let you run and share normal CoCalc projects
            on your own VMs (e.g. GPU or large-memory machines). Create one
            below to get started.
          </Typography.Paragraph>
        </Card>
      );
    }

    return (
      <Row gutter={[16, 16]}>
        {hosts.map((host) => (
          <Col xs={24} md={12} lg={8} key={host.id}>
            <Card
              title={host.name}
              extra={<Tag color={STATUS_COLOR[host.status]}>{host.status}</Tag>}
              actions={[
                <Button
                  key="start"
                  type="link"
                  disabled={host.status === "running"}
                  onClick={() => setStatus(host.id, "start")}
                >
                  Start
                </Button>,
                <Button
                  key="stop"
                  type="link"
                  disabled={host.status !== "running"}
                  onClick={() => setStatus(host.id, "stop")}
                >
                  Stop
                </Button>,
                <Button
                  key="details"
                  type="link"
                  onClick={() => {
                    setSelected(host);
                    setDrawerOpen(true);
                  }}
                >
                  Details
                </Button>,
                <Button
                  key="delete"
                  type="link"
                  danger
                  onClick={() => removeHost(host.id)}
                >
                  Delete
                </Button>,
              ]}
            >
              <Space direction="vertical" size="small">
                <Typography.Text>Region: {host.region}</Typography.Text>
                <Typography.Text>Size: {host.size}</Typography.Text>
                <Typography.Text>
                  GPU: {host.gpu ? "Yes" : "No"}
                </Typography.Text>
                <Typography.Text>
                  Projects: {host.projects ?? 0}
                </Typography.Text>
                {host.last_action && (
                  <Typography.Text type="secondary">
                    Last action: {host.last_action}
                    {host.last_action_status
                      ? ` (${host.last_action_status})`
                      : ""}
                    {host.last_action_at
                      ? ` · ${new Date(host.last_action_at).toLocaleString()}`
                      : ""}
                  </Typography.Text>
                )}
                {host.status === "error" && host.error && (
                  <Typography.Text type="danger">{host.error}</Typography.Text>
                )}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    );
  }, [hosts]);

  const regionField = (
    <Form.Item name="region" label="Region" initialValue="us-east1">
      <Select
        options={regionOptions}
        disabled={selectedProvider === "none" || selectedProvider === "local"}
      />
    </Form.Item>
  );

  return (
    <div className="smc-vfill" style={WRAP_STYLE}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                <Icon name="plus" /> Create host
              </span>
            }
            extra={
              isAdmin ? (
                <Space size="small">
                  <Select
                    size="small"
                    value={refreshProvider}
                    onChange={(value) => setRefreshProvider(value)}
                    options={refreshProviders}
                    style={{ width: 140 }}
                  />
                  <Button
                    size="small"
                    onClick={refreshCatalog}
                    loading={catalogRefreshing}
                    disabled={!refreshProviders.length}
                  >
                    Refresh catalog
                  </Button>
                </Space>
              ) : undefined
            }
          >
            {!canCreateHosts && (
              <Alert
                type="info"
                showIcon
                message="Your membership does not allow creating project hosts."
                style={{ marginBottom: 12 }}
              />
            )}
            <HostAiAssist
              aiQuestion={aiPrompt}
              setAiQuestion={setAiPrompt}
              aiBudget={aiBudget}
              setAiBudget={setAiBudget}
              aiRegionGroup={aiRegionGroup}
              setAiRegionGroup={setAiRegionGroup}
              aiLoading={aiLoading}
              aiError={aiError}
              aiResults={aiResults}
              canRecommend={!!catalogSummary}
              runAiRecommendation={runAiRecommendation}
              applyRecommendation={applyRecommendation}
            />
            <HostCreateForm
              form={form}
              canCreateHosts={canCreateHosts}
              providerOptions={providerOptions}
              selectedProvider={selectedProvider}
              regionField={regionField}
              hyperstackFlavorOptions={hyperstackFlavorOptions}
              lambdaInstanceTypeOptions={lambdaInstanceTypeOptions}
              nebiusInstanceTypeOptions={nebiusInstanceTypeOptions}
              zoneOptions={zoneOptions}
              machineTypeOptions={machineTypeOptions}
              imageOptions={imageOptions}
              gpuTypeOptions={gpuTypeOptions}
              storageModeOptions={storageModeOptions}
              supportsPersistentStorage={supportsPersistentStorage}
              persistentGrowable={persistentGrowable}
              showDiskFields={showDiskFields}
              catalogError={catalogError}
              onCreate={onCreate}
            />
            <Divider style={{ margin: "8px 0" }} />
            <Space
              direction="vertical"
              style={{ width: "100%" }}
              size="small"
            >
              <Typography.Text type="secondary">
                Cost estimate (placeholder): updates with size/region
              </Typography.Text>
              <Button
                type="primary"
                onClick={() => form.submit()}
                loading={creating}
                disabled={!canCreateHosts}
                block
              >
                Create host
              </Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          {content}
        </Col>
      </Row>
      <Drawer
        title={
          <Space>
            <Icon name="server" /> {selected?.name ?? "Host details"}
            {selected && (
              <Tag color={STATUS_COLOR[selected.status]}>{selected.status}</Tag>
            )}
          </Space>
        }
        width={640}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen && !!selected}
      >
        {selected ? (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Space size="small">
              <Tag>{selected.region}</Tag>
              <Tag>{selected.size}</Tag>
              {selected.gpu && <Tag color="purple">GPU</Tag>}
            </Space>
            <Typography.Text copyable={{ text: selected.id }}>
              Host ID: {selected.id}
            </Typography.Text>
            <Space direction="vertical" size="small">
              {selected.machine?.cloud && selected.public_ip && (
                <Typography.Text copyable={{ text: selected.public_ip }}>
                  Public IP: {selected.public_ip}
                </Typography.Text>
              )}
              {selected.machine?.zone && (
                <Typography.Text>Zone: {selected.machine.zone}</Typography.Text>
              )}
              {selected.machine?.machine_type && (
                <Typography.Text>
                  Machine type: {selected.machine.machine_type}
                </Typography.Text>
              )}
              {selected.machine?.gpu_type && (
                <Typography.Text>
                  GPU type: {selected.machine.gpu_type}
                </Typography.Text>
              )}
              {(selected.machine?.source_image ||
                selected.machine?.metadata?.source_image) && (
                <Typography.Text>
                  Image:{" "}
                  {selected.machine?.source_image ??
                    selected.machine?.metadata?.source_image}
                </Typography.Text>
              )}
            </Space>
            <Typography.Text>
              Projects: {selected.projects ?? 0}
            </Typography.Text>
            <Typography.Text type="secondary">
              Last seen: {selected.last_seen ?? "n/a"}
            </Typography.Text>
            {selected.status === "error" && selected.error && (
              <Alert
                type="error"
                showIcon
                message="Provisioning error"
                description={selected.error}
              />
            )}
            <Divider />
            <Typography.Title level={5}>Recent actions</Typography.Title>
            {loadingLog ? (
              <Typography.Text type="secondary">Loading…</Typography.Text>
            ) : hostLog.length === 0 ? (
              <Typography.Text type="secondary">
                No actions yet.
              </Typography.Text>
            ) : (
              <Space
                direction="vertical"
                style={{ width: "100%" }}
                size="small"
              >
                {hostLog.map((entry) => (
                  <Card
                    key={entry.id}
                    size="small"
                    bodyStyle={{ padding: "10px 12px" }}
                  >
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ fontWeight: 600 }}>
                        {entry.action} — {entry.status}
                      </div>
                      <div style={{ color: "#888", fontSize: 12 }}>
                        {entry.ts
                          ? new Date(entry.ts).toLocaleString()
                          : "unknown time"}
                      </div>
                      {entry.error && (
                        <div style={{ color: "#c00", fontSize: 12 }}>
                          {entry.error}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </Space>
            )}
            <Divider />
            <Typography.Title level={5}>Activity</Typography.Title>
            <Bootlog host_id={selected.id} style={{ maxWidth: "100%" }} />
          </Space>
        ) : (
          <Typography.Text type="secondary">
            Select a host to see details.
          </Typography.Text>
        )}
      </Drawer>
    </div>
  );
};
