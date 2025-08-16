/**
 * Easebuzz Payment Gateway Zod Schemas
 *
 * This file contains Zod schemas for validating Easebuzz API requests
 * and responses to ensure type safety and runtime validation.
 */
import { z } from "zod";

import type {
  EasebuzzPaymentStatus,
  EasebuzzEnvironment,
  EasebuzzPaymentMethod,
} from "@calcom/types/Easebuzz";

/**
 * Easebuzz Payment Status Schema
 */
export const easebuzzPaymentStatusSchema = z.enum([
  "success",
  "failure",
  "pending",
  "cancelled",
  "refunded",
]) as z.ZodType<EasebuzzPaymentStatus>;

/**
 * Easebuzz Environment Schema
 */
export const easebuzzEnvironmentSchema = z.enum(["test", "prod"]) as z.ZodType<EasebuzzEnvironment>;

/**
 * Easebuzz Payment Method Schema
 */
export const easebuzzPaymentMethodSchema = z.enum([
  "CC", // Credit Card
  "DC", // Debit Card
  "NB", // Net Banking
  "UPI", // UPI
  "WALLET", // Digital Wallet
  "EMI", // EMI
]) as z.ZodType<EasebuzzPaymentMethod>;

/**
 * Easebuzz Initiate Payment Request Schema
 */
export const easebuzzInitiateRequestSchema = z.object({
  // Required fields
  key: z.string().min(1, "Merchant key is required"),
  merchant_txn: z.string().min(1, "Merchant transaction ID is required"),
  amount: z.number().positive("Amount must be positive"),
  firstname: z.string().min(1, "First name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Valid phone number is required"),
  product_info: z.string().min(1, "Product info is required"),
  surl: z.string().url("Valid success URL is required"),
  furl: z.string().url("Valid failure URL is required"),

  // Optional fields
  currency: z.string().optional(),
  lastname: z.string().optional(),
  address1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zipcode: z.string().optional(),
  udf1: z.string().optional(),
  udf2: z.string().optional(),
  udf3: z.string().optional(),
  udf4: z.string().optional(),
  udf5: z.string().optional(),
  pg: easebuzzPaymentMethodSchema.optional(),
  bankcode: z.string().optional(),
  txnid: z.string().optional(),
  hash: z.string().optional(),
});

/**
 * Easebuzz Initiate Payment Response Data Schema
 */
export const easebuzzInitiateResponseDataSchema = z.object({
  access_key: z.string(),
  pg_url: z.string().url(),
  txnid: z.string(),
  merchant_txn: z.string(),
  amount: z.number(),
  currency: z.string(),
  email: z.string().email(),
  phone: z.string(),
  product_info: z.string(),
  surl: z.string().url(),
  furl: z.string().url(),
  hash: z.string(),
});

/**
 * Easebuzz Initiate Payment Response Schema
 */
export const easebuzzInitiateResponseSchema = z.object({
  status: z.string(),
  data: easebuzzInitiateResponseDataSchema,
  error: z.string().optional(),
  error_code: z.string().optional(),
});

/**
 * Easebuzz Callback Response Schema
 */
export const easebuzzCallbackResponseSchema = z.object({
  txnid: z.string(),
  merchant_txn: z.string(),
  amount: z.number(),
  status: easebuzzPaymentStatusSchema,
  hash: z.string(),
  pg: z.string().optional(),
  bankcode: z.string().optional(),
  error: z.string().optional(),
  error_code: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  product_info: z.string().optional(),
  currency: z.string().optional(),
  udf1: z.string().optional(),
  udf2: z.string().optional(),
  udf3: z.string().optional(),
  udf4: z.string().optional(),
  udf5: z.string().optional(),
});

/**
 * Easebuzz Transaction Status Response Data Schema
 */
export const easebuzzTransactionStatusDataSchema = z.object({
  txnid: z.string(),
  merchant_txn: z.string(),
  amount: z.number(),
  status: easebuzzPaymentStatusSchema,
  pg: z.string(),
  bankcode: z.string().optional(),
  error: z.string().optional(),
  error_code: z.string().optional(),
  date: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  product_info: z.string().optional(),
  currency: z.string().optional(),
});

/**
 * Easebuzz Transaction Status Response Schema
 */
export const easebuzzTransactionStatusResponseSchema = z.object({
  status: z.string(),
  data: easebuzzTransactionStatusDataSchema,
  error: z.string().optional(),
  error_code: z.string().optional(),
});

/**
 * Easebuzz Refund Request Schema
 */
export const easebuzzRefundRequestSchema = z.object({
  key: z.string().min(1, "Merchant key is required"),
  txnid: z.string().min(1, "Transaction ID is required"),
  amount: z.number().positive("Refund amount must be positive"),
  reason: z.string().optional(),
  hash: z.string().min(1, "Hash is required"),
});

/**
 * Easebuzz Refund Response Data Schema
 */
export const easebuzzRefundResponseDataSchema = z.object({
  refund_id: z.string(),
  txnid: z.string(),
  amount: z.number(),
  status: easebuzzPaymentStatusSchema,
  reason: z.string().optional(),
  date: z.string().optional(),
});

/**
 * Easebuzz Refund Response Schema
 */
export const easebuzzRefundResponseSchema = z.object({
  status: z.string(),
  data: easebuzzRefundResponseDataSchema,
  error: z.string().optional(),
  error_code: z.string().optional(),
});

/**
 * Easebuzz Configuration Schema
 */
export const easebuzzConfigSchema = z.object({
  merchantKey: z.string().min(1, "Merchant key is required"),
  salt: z.string().min(1, "Salt is required"),
  environment: easebuzzEnvironmentSchema,
  baseUrl: z.string().url("Valid base URL is required"),
  successUrl: z.string().url("Valid success URL is required"),
  failureUrl: z.string().url("Valid failure URL is required"),
});

/**
 * Easebuzz Environment Variables Schema
 */
export const easebuzzEnvSchema = z.object({
  EASEBUZZ_MERCHANT_KEY: z.string().min(1, "EASEBUZZ_MERCHANT_KEY is required"),
  EASEBUZZ_SALT: z.string().min(1, "EASEBUZZ_SALT is required"),
  EASEBUZZ_ENV: easebuzzEnvironmentSchema.default("test"),
  EASEBUZZ_BASE_URL: z.string().url().optional(),
});

/**
 * Validation helper functions
 */
export const easebuzzValidation = {
  /**
   * Validate initiate payment request
   */
  validateInitiateRequest: (data: unknown) => {
    return easebuzzInitiateRequestSchema.safeParse(data);
  },

  /**
   * Validate initiate payment response
   */
  validateInitiateResponse: (data: unknown) => {
    return easebuzzInitiateResponseSchema.safeParse(data);
  },

  /**
   * Validate callback response
   */
  validateCallbackResponse: (data: unknown) => {
    return easebuzzCallbackResponseSchema.safeParse(data);
  },

  /**
   * Validate transaction status response
   */
  validateTransactionStatusResponse: (data: unknown) => {
    return easebuzzTransactionStatusResponseSchema.safeParse(data);
  },

  /**
   * Validate refund request
   */
  validateRefundRequest: (data: unknown) => {
    return easebuzzRefundRequestSchema.safeParse(data);
  },

  /**
   * Validate refund response
   */
  validateRefundResponse: (data: unknown) => {
    return easebuzzRefundResponseSchema.safeParse(data);
  },

  /**
   * Validate configuration
   */
  validateConfig: (data: unknown) => {
    return easebuzzConfigSchema.safeParse(data);
  },

  /**
   * Validate environment variables
   */
  validateEnv: (data: unknown) => {
    return easebuzzEnvSchema.safeParse(data);
  },

  /**
   * Validate payment status
   */
  validatePaymentStatus: (status: string) => {
    return easebuzzPaymentStatusSchema.safeParse(status);
  },

  /**
   * Validate payment method
   */
  validatePaymentMethod: (method: string) => {
    return easebuzzPaymentMethodSchema.safeParse(method);
  },

  /**
   * Validate environment
   */
  validateEnvironment: (env: string) => {
    return easebuzzEnvironmentSchema.safeParse(env);
  },
};

/**
 * Type exports for convenience
 */
export type EasebuzzInitiateRequestSchema = z.infer<typeof easebuzzInitiateRequestSchema>;
export type EasebuzzInitiateResponseSchema = z.infer<typeof easebuzzInitiateResponseSchema>;
export type EasebuzzCallbackResponseSchema = z.infer<typeof easebuzzCallbackResponseSchema>;
export type EasebuzzTransactionStatusResponseSchema = z.infer<typeof easebuzzTransactionStatusResponseSchema>;
export type EasebuzzRefundRequestSchema = z.infer<typeof easebuzzRefundRequestSchema>;
export type EasebuzzRefundResponseSchema = z.infer<typeof easebuzzRefundResponseSchema>;
export type EasebuzzConfigSchema = z.infer<typeof easebuzzConfigSchema>;
export type EasebuzzEnvSchema = z.infer<typeof easebuzzEnvSchema>;
