import { authFirstRequireAccount } from "./util";
import type {
  SoftwareLicense,
  SoftwareLicenseTier,
} from "@cocalc/util/db-schema/software-licenses";

export const software = {
  listLicenseTiers: authFirstRequireAccount,
  upsertLicenseTier: authFirstRequireAccount,
  listLicenses: authFirstRequireAccount,
  createLicense: authFirstRequireAccount,
  revokeLicense: authFirstRequireAccount,
  restoreLicense: authFirstRequireAccount,
  listMyLicenses: authFirstRequireAccount,
};

export interface Software {
  listLicenseTiers: (opts: {
    account_id?: string;
    include_disabled?: boolean;
  }) => Promise<SoftwareLicenseTier[]>;
  upsertLicenseTier: (opts: {
    account_id?: string;
    tier: SoftwareLicenseTier;
  }) => Promise<void>;
  listLicenses: (opts: {
    account_id?: string;
    search?: string;
    limit?: number;
  }) => Promise<SoftwareLicense[]>;
  createLicense: (opts: {
    account_id?: string;
    tier_id: string;
    owner_account_id?: string;
    product?: "launchpad" | "rocket";
    expires_at?: string;
    limits?: Record<string, any>;
    features?: Record<string, any>;
    notes?: string;
  }) => Promise<SoftwareLicense>;
  revokeLicense: (opts: {
    account_id?: string;
    license_id: string;
    reason?: string;
  }) => Promise<void>;
  restoreLicense: (opts: {
    account_id?: string;
    license_id: string;
  }) => Promise<void>;
  listMyLicenses: (opts: { account_id?: string }) => Promise<SoftwareLicense[]>;
}
