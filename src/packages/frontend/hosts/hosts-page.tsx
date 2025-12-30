import {
  Button,
  Card,
  Col,
  Collapse,
  Divider,
  Drawer,
  Form,
  Input,
  Row,
  Select,
  Slider,
  Space,
  Tag,
  Typography,
  Alert,
  message,
} from "antd";
import {
  CSS,
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

const WRAP_STYLE: CSS = {
  padding: "24px",
  width: "100%",
  height: "100%",
  overflow: "auto",
  boxSizing: "border-box",
};

const STATUS_COLOR = {
  stopped: "red",
  running: "green",
  provisioning: "blue",
  starting: "blue",
  stopping: "orange",
  deprovisioned: "default",
  off: "red",
} as const;

const REGIONS = [
  { value: "us-west", label: "US West" },
  { value: "us-east", label: "US East" },
  { value: "eu-west", label: "EU West" },
];

const LAMBDA_REGIONS = [
  "us-west-1",
  "us-west-2",
  "us-west-3",
  "us-east-1",
  "us-east-2",
  "us-east-3",
  "us-south-1",
  "us-south-2",
  "us-south-3",
  "us-midwest-1",
  "us-midwest-2",
  "europe-central-1",
  "europe-central-2",
  "europe-central-3",
  "europe-west-1",
  "europe-west-2",
  "europe-west-3",
  "europe-north-1",
  "europe-south-1",
  "asia-south-1",
  "asia-south-2",
  "asia-south-3",
  "asia-northeast-1",
  "asia-northeast-2",
  "asia-northeast-3",
  "asia-east-1",
  "asia-east-2",
  "asia-east-3",
  "asia-southeast-1",
  "asia-southeast-2",
  "me-west-1",
].map((name) => ({ value: name, label: name }));

const SIZES = [
  { value: "small", label: "Small (2 vCPU / 8 GB)" },
  { value: "medium", label: "Medium (4 vCPU / 16 GB)" },
  { value: "large", label: "Large (8 vCPU / 32 GB)" },
  { value: "gpu", label: "GPU (4 vCPU / 24 GB + GPU)" },
];

const GPU_TYPES = [
  { value: "none", label: "No GPU" },
  { value: "l4", label: "NVIDIA L4" },
  { value: "a10g", label: "NVIDIA A10G" },
];

type HostProvider = "gcp" | "hyperstack" | "lambda" | "none";

const PROVIDERS: Array<{ value: HostProvider; label: string }> = [
  { value: "gcp", label: "Google Cloud" },
  { value: "hyperstack", label: "Hyperstack" },
  { value: "lambda", label: "Lambda Cloud" },
  { value: "none", label: "Local (manual setup)" },
];

const DISK_TYPES = [
  { value: "balanced", label: "Balanced SSD" },
  { value: "ssd", label: "SSD" },
  { value: "standard", label: "Standard (HDD)" },
];

type HostRecommendation = {
  title?: string;
  provider: HostProvider;
  region?: string;
  zone?: string;
  machine_type?: string;
  flavor?: string;
  gpu_type?: string;
  gpu_count?: number;
  disk_gb?: number;
  source_image?: string;
  rationale?: string;
  est_cost_per_hour?: number;
};

function extractJsonPayload(reply: string): any | undefined {
  const trimmed = reply.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // fall through
    }
  }
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // fall through
    }
  }
  return undefined;
}

function normalizeRecommendation(input: any): HostRecommendation | null {
  if (!input || typeof input !== "object") return null;
  const normalizeString = (value: any): string | undefined => {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (value && typeof value === "object") {
      if (typeof value.name === "string") return value.name;
      if (typeof value.id === "string") return value.id;
    }
    return undefined;
  };
  const provider = normalizeString(input.provider) as HostProvider | undefined;
  if (
    !provider ||
    (provider !== "gcp" && provider !== "hyperstack" && provider !== "lambda")
  ) {
    return null;
  }
  return {
    title: normalizeString(input.title ?? input.name ?? input.label),
    provider,
    region: normalizeString(input.region),
    zone: normalizeString(input.zone),
    machine_type: normalizeString(input.machine_type ?? input.instance_type),
    flavor: normalizeString(input.flavor),
    gpu_type: normalizeString(input.gpu_type),
    gpu_count:
      typeof input.gpu_count === "number" ? input.gpu_count : undefined,
    disk_gb: typeof input.disk_gb === "number" ? input.disk_gb : undefined,
    source_image: normalizeString(input.source_image),
    rationale: normalizeString(
      input.rationale ?? input.reason ?? input.explanation ?? input.summary,
    ),
    est_cost_per_hour:
      typeof input.est_cost_per_hour === "number"
        ? input.est_cost_per_hour
        : undefined,
  };
}

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
  const showLocal =
    typeof window !== "undefined" && window.location.hostname === "localhost";

  const providerOptions = useMemo(() => {
    return PROVIDERS.filter((opt) => {
      if (opt.value === "gcp") return !!gcpEnabled;
      if (opt.value === "hyperstack") return !!hyperstackEnabled;
      if (opt.value === "lambda") return !!lambdaEnabled;
      if (opt.value === "none") return showLocal;
      return false;
    });
  }, [gcpEnabled, hyperstackEnabled, lambdaEnabled, showLocal]);

  const refreshProviders = useMemo(() => {
    const opts: Array<{ value: HostProvider; label: string }> = [];
    if (gcpEnabled) opts.push({ value: "gcp", label: "GCP" });
    if (hyperstackEnabled)
      opts.push({ value: "hyperstack", label: "Hyperstack" });
    if (lambdaEnabled) opts.push({ value: "lambda", label: "Lambda Cloud" });
    return opts;
  }, [gcpEnabled, hyperstackEnabled, lambdaEnabled]);

  useEffect(() => {
    const current = form.getFieldValue("provider") as HostProvider | undefined;
    if (current === "gcp" && !gcpEnabled) {
      form.setFieldsValue({ provider: "none" });
    } else if (current === "hyperstack" && !hyperstackEnabled) {
      form.setFieldsValue({ provider: "none" });
    } else if (current === "lambda" && !lambdaEnabled) {
      form.setFieldsValue({ provider: "none" });
    } else if (!current) {
      form.setFieldsValue({ provider: providerOptions[0]?.value ?? "none" });
    }
  }, [gcpEnabled, hyperstackEnabled, lambdaEnabled, providerOptions, form]);

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
        hyperstackEnabled ? "hyperstack" : lambdaEnabled ? "lambda" : "gcp",
      );
    } else if (refreshProvider === "hyperstack" && !hyperstackEnabled) {
      setRefreshProvider(
        gcpEnabled ? "gcp" : lambdaEnabled ? "lambda" : "hyperstack",
      );
    } else if (refreshProvider === "lambda" && !lambdaEnabled) {
      setRefreshProvider(
        gcpEnabled ? "gcp" : hyperstackEnabled ? "hyperstack" : "lambda",
      );
    }
  }, [refreshProvider, gcpEnabled, hyperstackEnabled, lambdaEnabled]);

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
            : gcpEnabled
              ? "gcp"
              : hyperstackEnabled
                ? "hyperstack"
                : lambdaEnabled
                  ? "lambda"
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
  }, [selectedProvider, gcpEnabled, hyperstackEnabled, hub.hosts]);

  useEffect(() => {
    const timer = setInterval(() => {
      refresh().catch((err) => console.error("host refresh failed", err));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const hyperstackRegionOptions = catalog?.hyperstack_regions?.length
    ? catalog.hyperstack_regions.map((r) => ({
        value: r.name,
        label: r.description ? `${r.name} — ${r.description}` : r.name,
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

  const regionOptions =
    selectedProvider === "hyperstack" && hyperstackRegionOptions.length
      ? hyperstackRegionOptions
      : selectedProvider === "lambda"
        ? lambdaRegionOptions
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
    if (selectedProvider !== "hyperstack") return;
    if (!hyperstackRegionOptions.length) return;
    if (
      selectedRegion &&
      hyperstackRegionOptions.some((r) => r.value === selectedRegion)
    ) {
      return;
    }
    form.setFieldsValue({ region: hyperstackRegionOptions[0].value });
  }, [selectedProvider, hyperstackRegionOptions, selectedRegion, form]);

  useEffect(() => {
    if (selectedProvider !== "lambda") return;
    if (!lambdaRegionOptions.length) return;
    const values = new Set(lambdaRegionOptions.map((r) => r.value));
    if (selectedRegion && values.has(selectedRegion)) return;
    form.setFieldsValue({ region: lambdaRegionOptions[0].value });
  }, [selectedProvider, selectedRegion, lambdaRegionOptions, form]);

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
              provider: "gcp|hyperstack|lambda",
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
      const genericGpuType =
        vals.gpu && vals.gpu !== "none" ? vals.gpu : undefined;
      const wantsGpu =
        vals.provider === "hyperstack"
          ? hyperstackGpuCount > 0
          : vals.provider === "gcp"
            ? !!gpu_type
            : vals.provider === "lambda"
              ? lambdaGpuCount > 0
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
              : machine_type,
          gpu_type:
            vals.provider === "hyperstack"
              ? hyperstackGpuType
              : vals.provider === "gcp"
                ? gpu_type
                : vals.provider === "lambda"
                  ? undefined
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
            <Card
              size="small"
              style={{ marginBottom: 12 }}
              title={
                <Space size="small">
                  <Icon name="magic" /> Ask for a recommendation
                </Space>
              }
            >
              <Space direction="vertical" style={{ width: "100%" }}>
                <Input.TextArea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe what you want to run and why (e.g., small GPU box for fine-tuning)."
                  autoSize={{ minRows: 2, maxRows: 4 }}
                />
                <Row gutter={8}>
                  <Col span={12}>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      value={aiBudget}
                      onChange={(e) =>
                        setAiBudget(
                          e.target.value ? Number(e.target.value) : undefined,
                        )
                      }
                      placeholder="Max $/hour (optional)"
                    />
                  </Col>
                  <Col span={12}>
                    <Select
                      value={aiRegionGroup}
                      onChange={setAiRegionGroup}
                      options={[
                        { value: "any", label: "Any region" },
                        ...REGIONS,
                      ]}
                    />
                  </Col>
                </Row>
                <Button
                  onClick={runAiRecommendation}
                  loading={aiLoading}
                  disabled={!catalogSummary}
                >
                  Get recommendations
                </Button>
                {aiError && <Alert type="error" message={aiError} />}
                {aiResults.length > 0 && (
                  <Space
                    direction="vertical"
                    style={{ width: "100%" }}
                    size="small"
                  >
                    {aiResults.map((rec, idx) => (
                      <Card
                        key={`${rec.provider}-${rec.region}-${idx}`}
                        size="small"
                        bodyStyle={{ padding: "10px 12px" }}
                      >
                        <Space
                          direction="vertical"
                          style={{ width: "100%" }}
                          size={2}
                        >
                          <Space
                            align="start"
                            style={{ justifyContent: "space-between" }}
                          >
                            <div>
                              <Typography.Text strong>
                                {rec.title ?? `Option ${idx + 1}`}
                              </Typography.Text>
                              {rec.rationale && (
                                <div style={{ color: "#888" }}>
                                  {rec.rationale}
                                </div>
                              )}
                            </div>
                            <Button
                              type="link"
                              size="small"
                              onClick={() => applyRecommendation(rec)}
                            >
                              Apply
                            </Button>
                          </Space>
                          <Space direction="vertical" size={0}>
                            <Typography.Text type="secondary">
                              {rec.provider} · {rec.region ?? "any"}
                            </Typography.Text>
                            {rec.machine_type && (
                              <Typography.Text type="secondary">
                                {rec.machine_type}
                              </Typography.Text>
                            )}
                            {rec.flavor && (
                              <Typography.Text type="secondary">
                                {rec.flavor}
                              </Typography.Text>
                            )}
                            {rec.est_cost_per_hour != null && (
                              <Typography.Text type="secondary">
                                ~${rec.est_cost_per_hour}/hr
                              </Typography.Text>
                            )}
                          </Space>
                        </Space>
                      </Card>
                    ))}
                  </Space>
                )}
              </Space>
            </Card>
            <Form
              layout="vertical"
              onFinish={onCreate}
              disabled={!canCreateHosts}
              form={form}
            >
              <Form.Item name="name" label="Name" initialValue="My host">
                <Input placeholder="My host" />
              </Form.Item>
              <Form.Item
                name="provider"
                label="Provider"
                initialValue={providerOptions[0]?.value ?? "gcp"}
              >
                <Select options={providerOptions} />
              </Form.Item>
              {selectedProvider === "lambda" ? null : regionField}
              {selectedProvider === "none" && (
                <Form.Item
                  name="size"
                  label="Size"
                  initialValue={SIZES[0].value}
                >
                  <Select options={SIZES} />
                </Form.Item>
              )}
              {selectedProvider === "hyperstack" && (
                <Form.Item
                  name="size"
                  label="Size"
                  initialValue={hyperstackFlavorOptions[0]?.value}
                >
                  <Select options={hyperstackFlavorOptions} />
                </Form.Item>
              )}
              {selectedProvider === "lambda" && (
                <>
                  <Form.Item
                    name="machine_type"
                    label="Instance type"
                    initialValue={lambdaInstanceTypeOptions[0]?.value}
                  >
                    <Select options={lambdaInstanceTypeOptions} />
                  </Form.Item>
                  {regionField}
                </>
              )}
              {catalogError && selectedProvider === "gcp" && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="Cloud catalog unavailable"
                  description={catalogError}
                />
              )}
              <Collapse ghost style={{ marginBottom: 8 }}>
                <Collapse.Panel header="Advanced options" key="adv">
                  <Row gutter={[12, 12]}>
                    {selectedProvider === "gcp" && (
                      <>
                        <Col span={24}>
                          <Form.Item
                            name="zone"
                            label="Zone"
                            initialValue={zoneOptions[0]?.value}
                            tooltip="Zones are derived from the selected region."
                          >
                            <Select options={zoneOptions} />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item
                            name="machine_type"
                            label="Machine type"
                            initialValue={machineTypeOptions[0]?.value}
                          >
                            <Select options={machineTypeOptions} />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item
                            name="source_image"
                            label="Base image"
                            tooltip="Optional override; leave blank for the default Ubuntu image."
                          >
                            <Select
                              options={[
                                { value: "", label: "Default (Ubuntu LTS)" },
                                ...imageOptions,
                              ]}
                              showSearch
                              optionFilterProp="label"
                              allowClear
                            />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item
                            name="gpu_type"
                            label="GPU"
                            initialValue="none"
                          >
                            <Select
                              options={[
                                { value: "none", label: "No GPU" },
                                ...gpuTypeOptions,
                              ]}
                            />
                          </Form.Item>
                        </Col>
                      </>
                    )}
                    {selectedProvider !== "gcp" &&
                      selectedProvider !== "lambda" && (
                        <Col span={24}>
                          <Form.Item
                            name="gpu"
                            label="GPU"
                            initialValue="none"
                            tooltip="Only needed for GPU workloads."
                          >
                            <Select options={GPU_TYPES} />
                          </Form.Item>
                        </Col>
                      )}
                    {selectedProvider !== "none" && (
                      <Col span={24}>
                        <Form.Item
                          name="storage_mode"
                          label="Storage mode"
                          initialValue="persistent"
                          tooltip={
                            supportsPersistentStorage
                              ? persistentGrowable
                                ? "Ephemeral uses fast local disks; persistent uses a separate growable disk."
                                : "Ephemeral uses fast local disks; persistent uses a separate fixed-size disk."
                              : "Only ephemeral storage is available for this provider."
                          }
                        >
                          <Select
                            options={storageModeOptions}
                            disabled={!supportsPersistentStorage}
                          />
                        </Form.Item>
                      </Col>
                    )}
                    {showDiskFields && (
                      <>
                        <Col span={24}>
                          <Form.Item
                            name="disk"
                            label="Disk size (GB)"
                            initialValue={100}
                            tooltip={`Disk for storing all projects on this host.  Files are compressed and deduplicated. ${persistentGrowable ? "You can enlarge this disk at any time later." : "This disk CANNOT be enlarged later."}`}
                          >
                            <Slider min={50} max={1000} step={50} />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item
                            name="disk_type"
                            label="Disk type"
                            initialValue={DISK_TYPES[0].value}
                          >
                            <Select options={DISK_TYPES} />
                          </Form.Item>
                        </Col>
                        <Col span={24}>
                          <Form.Item
                            name="boot_disk_gb"
                            label="Boot disk size (GB)"
                            initialValue={20}
                          >
                            <Slider min={10} max={200} step={5} />
                          </Form.Item>
                        </Col>
                      </>
                    )}
                    <Col span={24}>
                      <Form.Item
                        name="shared"
                        label="Shared volume"
                        tooltip="Optional Btrfs subvolume bind-mounted into projects on this host."
                        initialValue="none"
                      >
                        <Select
                          options={[
                            { value: "none", label: "None" },
                            { value: "rw", label: "Shared volume (rw)" },
                            { value: "ro", label: "Shared volume (ro)" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        name="bucket"
                        label="Mount bucket (gcsfuse)"
                        tooltip="Optional bucket to mount via gcsfuse on this host."
                      >
                        <Input placeholder="bucket-name (optional)" />
                      </Form.Item>
                    </Col>
                  </Row>
                </Collapse.Panel>
              </Collapse>
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
                  htmlType="submit"
                  loading={creating}
                  disabled={!canCreateHosts}
                  block
                >
                  Create host
                </Button>
              </Space>
            </Form>
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
