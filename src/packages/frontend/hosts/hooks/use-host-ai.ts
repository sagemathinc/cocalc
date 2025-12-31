import { useState } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import type { HostRecommendation } from "../types";
import { extractJsonPayload, normalizeRecommendation } from "../utils/recommendations";

type UseHostAiOptions = {
  catalogSummary?: Record<string, any>;
  availableProviders?: HostRecommendation["provider"][];
};

export const useHostAi = ({ catalogSummary, availableProviders }: UseHostAiOptions) => {
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBudget, setAiBudget] = useState<number | undefined>(undefined);
  const [aiRegionGroup, setAiRegionGroup] = useState<string>("any");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | undefined>(undefined);
  const [aiResults, setAiResults] = useState<HostRecommendation[]>([]);
  const [llmModel] = useLanguageModelSetting();

  const runAiRecommendation = async () => {
    if (!aiPrompt.trim()) {
      setAiError("Tell us what you want to run.");
      return;
    }
    setAiError(undefined);
    setAiLoading(true);
    try {
      const providers =
        availableProviders?.filter((provider) => provider && provider !== "none") ??
        (Object.keys(catalogSummary ?? {}) as HostRecommendation["provider"][]);
      if (!providers.length) {
        throw new Error("No providers available for recommendations");
      }
      const providerList = providers.join("|");
      const hasRegionGroups = Object.values(catalogSummary ?? {}).some(
        (summary) => summary && typeof summary === "object" && "region_groups" in summary,
      );
      const regionGuidance = hasRegionGroups
        ? "Use the region_group preference to select a region from catalog.<provider>.region_groups when possible. "
        : "";
      const system =
        "You recommend cloud host configs. Return only valid JSON. " +
        "Always respond with an object that has a single key named options " +
        "whose value is an array of recommendation objects. " +
        "Each option must choose provider/region/machine/flavor/image from the provided catalog. " +
        regionGuidance +
        "If the requested group has no regions, choose the closest available region and explain why. " +
        "Do not claim a region is missing; always pick the best available from the catalog. " +
        "If multiple providers are available, include options for more than one unless the user explicitly requests a single provider.";
      const input = JSON.stringify({
        request: aiPrompt.trim(),
        budget_usd_per_hour: aiBudget ?? null,
        region_group: aiRegionGroup,
        catalog: catalogSummary,
        providers_available: providers,
        output_format: {
          options: [
            {
              title: "string",
              provider: providerList,
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

  return {
    aiPrompt,
    setAiPrompt,
    aiBudget,
    setAiBudget,
    aiRegionGroup,
    setAiRegionGroup,
    aiLoading,
    aiError,
    aiResults,
    runAiRecommendation,
  };
};
