// Standard tier ntworking is often $0.085 instead $0.12 / GB, so we use it when possible
// https://cloud.google.com/network-tiers/pricing and https://cloud.google.com/vpc/network-pricing#internet_egress
// However it is only available in *some* regions, and here's the list as of Sept 2023, from:
// copy-pasted from https://cloud.google.com/network-tiers/docs/overview#regions_supporting_standard_tier
const REGIONS_WITH_STANDARD_NETWORK_TIER = new Set(
  "asia-east1,asia-east2,asia-northeast1,asia-northeast3,asia-south1,asia-southeast1,asia-southeast2,australia-southeast1,us-west1,us-west2,us-west3,us-west4,us-central1,us-east1,us-east4,northamerica-northeast1,northamerica-northeast2,southamerica-east1,europe-north1,europe-west1,europe-west2,europe-west3,europe-west4,europe-west6".split(
    ",",
  ),
);

export function supportsStandardNetworkTier(region: string): boolean {
  return REGIONS_WITH_STANDARD_NETWORK_TIER.has(region);
}
