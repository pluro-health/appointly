/**
 * Easebuzz Payment Gateway Configuration and Utilities
 *
 * This file contains configuration settings and utility functions for
 * integrating with the Easebuzz payment gateway.
 */
import * as crypto from "crypto";

import type {
  EasebuzzConfig,
  EasebuzzEnvironment,
  EasebuzzInitiateRequest,
  EasebuzzCallbackResponse,
} from "@calcom/types/Easebuzz";
import { EasebuzzPaymentStatus } from "@calcom/types/Easebuzz";

// Import new hash utilities and service
import { EasebuzzHashUtils, getDefaultEasebuzzHashUtils } from "./easebuzz-hash";
import { EasebuzzService } from "./easebuzz-service";

/**
 * Easebuzz Configuration Class
 *
 * Manages configuration settings for Easebuzz payment gateway
 */
export class EasebuzzConfigManager {
  private config: EasebuzzConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfig(): EasebuzzConfig {
    const merchantKey = process.env.EASEBUZZ_MERCHANT_KEY;
    const salt = process.env.EASEBUZZ_SALT;
    const environment = (process.env.EASEBUZZ_ENV || "test") as EasebuzzEnvironment;

    if (!merchantKey) {
      throw new Error("EASEBUZZ_MERCHANT_KEY environment variable is required");
    }

    if (!salt) {
      throw new Error("EASEBUZZ_SALT environment variable is required");
    }

    // Determine base URL based on environment
    const baseUrl =
      process.env.EASEBUZZ_BASE_URL ||
      (environment === "prod" ? "https://pay.easebuzz.in" : "https://testpay.easebuzz.in");

    return {
      merchantKey,
      salt,
      environment,
      baseUrl,
      successUrl: `${
        process.env.NEXT_PUBLIC_WEBAPP_URL || "http://localhost:3000"
      }/api/payment/easebuzz/success`,
      failureUrl: `${
        process.env.NEXT_PUBLIC_WEBAPP_URL || "http://localhost:3000"
      }/api/payment/easebuzz/failure`,
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): EasebuzzConfig {
    return { ...this.config };
  }

  /**
   * Get merchant key
   */
  getMerchantKey(): string {
    return this.config.merchantKey;
  }

  /**
   * Get salt key
   */
  getSalt(): string {
    return this.config.salt;
  }

  /**
   * Get environment
   */
  getEnvironment(): EasebuzzEnvironment {
    return this.config.environment;
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Get success URL
   */
  getSuccessUrl(): string {
    return this.config.successUrl;
  }

  /**
   * Get failure URL
   */
  getFailureUrl(): string {
    return this.config.failureUrl;
  }

  /**
   * Check if Easebuzz is properly configured
   */
  isConfigured(): boolean {
    try {
      this.loadConfig();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Easebuzz Utility Functions
 */
export class EasebuzzUtils {
  private configManager: EasebuzzConfigManager;

  constructor() {
    this.configManager = new EasebuzzConfigManager();
  }

  /**
   * Generate hash for Easebuzz API requests (Legacy method - use EasebuzzHashUtils for new implementations)
   *
   * @param params - Parameters to hash
   * @returns Hash string
   * @deprecated Use EasebuzzHashUtils.generateEasebuzzHash() instead
   */
  generateHash(params: Record<string, string | number>): string {
    const config = this.configManager.getConfig();

    // Create a string of key-value pairs sorted by key
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("|");

    // Append salt to the string
    const hashString = sortedParams + "|" + config.salt;

    // Generate SHA512 hash
    return crypto.createHash("sha512").update(hashString).digest("hex");
  }

  /**
   * Validate hash from Easebuzz callback (Legacy method - use EasebuzzHashUtils for new implementations)
   *
   * @param callbackData - Callback data from Easebuzz
   * @returns True if hash is valid
   * @deprecated Use EasebuzzHashUtils.verifyEasebuzzHash() instead
   */
  validateHash(callbackData: EasebuzzCallbackResponse): boolean {
    const { hash, ...params } = callbackData;

    // Remove hash from params for validation
    const paramsForHash = Object.fromEntries(Object.entries(params).filter(([key]) => key !== "hash"));

    const expectedHash = this.generateHash(paramsForHash);
    return expectedHash === hash;
  }

  /**
   * Generate unique transaction ID
   *
   * @param prefix - Optional prefix for transaction ID
   * @returns Unique transaction ID
   */
  generateTransactionId(prefix?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const baseId = `${timestamp}_${random}`;

    return prefix ? `${prefix}_${baseId}` : baseId;
  }

  /**
   * Format amount for Easebuzz (convert to smallest currency unit)
   *
   * @param amount - Amount in major currency unit (e.g., rupees)
   * @returns Amount in smallest currency unit (e.g., paise)
   */
  formatAmount(amount: number): number {
    // Convert to paise (smallest unit for INR)
    return Math.round(amount * 100);
  }

  /**
   * Parse amount from Easebuzz (convert from smallest currency unit)
   *
   * @param amount - Amount in smallest currency unit (e.g., paise)
   * @returns Amount in major currency unit (e.g., rupees)
   */
  parseAmount(amount: number): number {
    // Convert from paise to rupees
    return amount / 100;
  }

  /**
   * Validate payment status
   *
   * @param status - Payment status string
   * @returns True if status is valid
   */
  isValidPaymentStatus(status: string): status is EasebuzzPaymentStatus {
    return Object.values(EasebuzzPaymentStatus).includes(status as EasebuzzPaymentStatus);
  }

  /**
   * Check if payment was successful
   *
   * @param status - Payment status
   * @returns True if payment was successful
   */
  isPaymentSuccessful(status: EasebuzzPaymentStatus): boolean {
    return status === EasebuzzPaymentStatus.SUCCESS;
  }

  /**
   * Check if payment failed
   *
   * @param status - Payment status
   * @returns True if payment failed
   */
  isPaymentFailed(status: EasebuzzPaymentStatus): boolean {
    return status === EasebuzzPaymentStatus.FAILURE;
  }

  /**
   * Check if payment is pending
   *
   * @param status - Payment status
   * @returns True if payment is pending
   */
  isPaymentPending(status: EasebuzzPaymentStatus): boolean {
    return status === EasebuzzPaymentStatus.PENDING;
  }

  /**
   * Get API endpoint URL
   *
   * @param endpoint - API endpoint path
   * @returns Full API URL
   */
  getApiUrl(endpoint: string): string {
    const baseUrl = this.configManager.getBaseUrl();
    return `${baseUrl}${endpoint}`;
  }

  /**
   * Prepare initiate payment request
   *
   * @param params - Payment parameters
   * @returns Prepared request with hash
   */
  prepareInitiateRequest(params: Omit<EasebuzzInitiateRequest, "key" | "hash">): EasebuzzInitiateRequest {
    const config = this.configManager.getConfig();

    const requestParams = {
      key: config.merchantKey,
      ...params,
    };

    const hash = this.generateHash(requestParams);

    return {
      ...requestParams,
      hash,
    };
  }
}

/**
 * Default Easebuzz configuration instance
 */
export const easebuzzConfig = new EasebuzzConfigManager();

/**
 * Default Easebuzz utilities instance
 */
export const easebuzzUtils = new EasebuzzUtils();

/**
 * Export commonly used functions for convenience
 */
export const {
  generateHash,
  validateHash,
  generateTransactionId,
  formatAmount,
  parseAmount,
  isValidPaymentStatus,
  isPaymentSuccessful,
  isPaymentFailed,
  isPaymentPending,
  getApiUrl,
  prepareInitiateRequest,
} = easebuzzUtils;

/**
 * Export configuration getters for convenience
 */
export const {
  getConfig,
  getMerchantKey,
  getSalt,
  getEnvironment,
  getBaseUrl,
  getSuccessUrl,
  getFailureUrl,
  isConfigured,
} = easebuzzConfig;

/**
 * Export new hash utilities and service for advanced usage
 */
export { EasebuzzService } from "./easebuzz-service";
export { EasebuzzHashUtils } from "./easebuzz-hash";
