import { z } from "../../framework";

export const PurchaseIdSchema = z.number().min(0).describe("Purchase id.");

export type PurchaseId = z.infer<typeof PurchaseIdSchema>;

export const InvoiceIdSchema = z.number().min(0).describe("Invoice id.");

export type InvoiceId = z.infer<typeof InvoiceIdSchema>;

export const DayStatementIdSchema = z
  .number()
  .min(0)
  .describe("Daily statement id.");

export type DayStatementId = z.infer<typeof DayStatementIdSchema>;

export const MonthStatementIdSchema = z
  .number()
  .min(0)
  .describe("Monthly statement id.");

export type MonthStatementId = z.infer<typeof MonthStatementIdSchema>;
