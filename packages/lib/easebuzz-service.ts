/**
 * Easebuzz Payment Service
 *
 * This file contains the main service class for handling all Easebuzz payment
 * gateway operations including payment initiation, status checking, and refunds.
 */
import * as crypto from "crypto";
import fetch from "node-fetch";

import { EasebuzzPaymentStatus } from "@calcom/types/Easebuzz";

import type { EasebuzzConfigManager } from "./easebuzz";
import logger from "./logger";

// Import js-sha512 for exact compatibility with official Easebuzz kit
const sha512 = require("js-sha512");

// Types for payment data
interface PaymentData {
  id: number;
  uid: string;
  title: string;
  startTime: Date;
  endTime: Date;
  userEmail: string;
  userName: string;
  userPhone: string;
  amount: number;
  currency: string;
  description: string;
}

interface CenterData {
  id: number;
  name: string;
  easebuzzSubMerchantId?: string | null;
}

interface PaymentInitiationResult {
  success: boolean;
  txnid?: string;
  transactionId?: string;
  paymentUrl?: string;
  accessKey?: string;
  response?: any;
  message?: string;
  error?: string;
  errorCode?: string;
}

interface HashVerificationResult {
  isValid: boolean;
  message: string;
}

export class EasebuzzService {
  private config: EasebuzzConfigManager;
  private webappUrl: string;

  constructor() {
    console.log(" EasebuzzService constructor started");

    // Import here to avoid circular dependency issues
    const { EasebuzzConfigManager } = require("./easebuzz");
    this.config = new EasebuzzConfigManager();
    this.webappUrl = process.env.NEXT_PUBLIC_WEBAPP_URL || "http://localhost:3000";

    console.log(" EasebuzzService initialized:", {
      environment: this.config.getEnvironment(),
      webappUrl: this.webappUrl,
      isConfigured: this.config.isConfigured(),
      hasKey: !!this.config.getMerchantKey(),
      hasSalt: !!this.config.getSalt(),
      keyLength: this.config.getMerchantKey()?.length || 0,
      saltLength: this.config.getSalt()?.length || 0,
    });

    logger.info(" EasebuzzService initialized", {
      environment: this.config.getEnvironment(),
      webappUrl: this.webappUrl,
      isConfigured: this.config.isConfigured(),
    });
  }

  /**
   * Get debug information about the service configuration
   */
  public getDebugInfo(): {
    environment: string;
    baseUrl: string;
    isConfigured: boolean;
    serviceConfig: {
      hasKey: boolean;
      hasSalt: boolean;
      webappUrl: string;
    };
  } {
    return {
      environment: this.config.getEnvironment(),
      baseUrl: this.getBaseUrl(),
      isConfigured: this.config.isConfigured(),
      serviceConfig: {
        hasKey: !!this.config.getMerchantKey(),
        hasSalt: !!this.config.getSalt(),
        webappUrl: this.webappUrl,
      },
    };
  }

  /**
   * Check if the service is properly configured
   */
  public isConfigured(): boolean {
    return this.config.isConfigured();
  }

  /**
   * Generate hash according to official Easebuzz format (EXACT MATCH)
   */
  private generateHash(params: {
    key: string;
    txnid: string;
    amount: string;
    productinfo: string;
    name: string; // Changed from firstname to name to match official kit
    email: string;
    udf1?: string;
    udf2?: string;
    udf3?: string;
    udf4?: string;
    udf5?: string;
    udf6?: string;
    udf7?: string;
    udf8?: string;
    udf9?: string;
    udf10?: string;
    salt: string;
  }): string {
    console.log("🔐 Starting hash generation with params:", {
      key: params.key?.substring(0, 10) + "***",
      txnid: params.txnid,
      amount: params.amount,
      productinfo: params.productinfo,
      name: params.name,
      email: params.email,
      udf1: params.udf1,
      salt: params.salt?.substring(0, 10) + "***",
    });

    // EXACT OFFICIAL EASEBUZZ HASH FORMAT
    // From official kit: config.key + "|" + data.txnid + "|" + data.amount + "|" + data.productinfo + "|" + data.name + "|" + data.email +
    // "|" + data.udf1 + "|" + data.udf2 + "|" + data.udf3 + "|" + data.udf4 + "|" + data.udf5 + "|" + data.udf6 + "|" + data.udf7 + "|" + data.udf8 + "|" + data.udf9 + "|" + data.udf10;
    // hashstring += "|" + config.salt;

    const hashString =
      params.key +
      "|" +
      params.txnid +
      "|" +
      params.amount +
      "|" +
      params.productinfo +
      "|" +
      params.name +
      "|" +
      params.email +
      "|" +
      (params.udf1 || "") +
      "|" +
      (params.udf2 || "") +
      "|" +
      (params.udf3 || "") +
      "|" +
      (params.udf4 || "") +
      "|" +
      (params.udf5 || "") +
      "|" +
      (params.udf6 || "") +
      "|" +
      (params.udf7 || "") +
      "|" +
      (params.udf8 || "") +
      "|" +
      (params.udf9 || "") +
      "|" +
      (params.udf10 || "") +
      "|" +
      params.salt;

    console.log("🔐 Hash string constructed (OFFICIAL FORMAT):", hashString.substring(0, 100) + "...");

    // Use js-sha512 exactly like official kit: sha512.sha512(hashstring)
    const hash = sha512.sha512(hashString);

    console.log("🔐 Hash generated successfully (js-sha512):", {
      txnid: params.txnid,
      hashLength: hash.length,
      hashPreview: hash.substring(0, 20) + "...",
    });

    logger.info("🔐 Hash generated", {
      txnid: params.txnid,
      hashString: hashString.substring(0, 100) + "...", // Log partial hash string for debugging
      hashLength: hash.length,
    });

    return hash;
  }

  /**
   * Verify response hash (reverse hash for callbacks)
   * Based on Easebuzz documentation: "A reverse hash of the transaction data for security and validation purposes"
   */
  public async verifyPayment(callbackData: any): Promise<HashVerificationResult> {
    try {
      const salt = this.config.getSalt();
      const merchantKey = this.config.getMerchantKey();

      logger.info("🔐 Starting hash verification", {
        txnid: callbackData.txnid,
        amount: callbackData.amount,
        status: callbackData.status,
      });

      // Easebuzz reverse hash format (confirmed working format)
      // Format: salt|status|udf10|udf9|...|udf1|email|firstname|productinfo|amount|txnid|merchantkey
      const reverseHashString =
        salt +
        "|" +
        (callbackData.status || "") +
        "|" +
        (callbackData.udf10 || "") +
        "|" +
        (callbackData.udf9 || "") +
        "|" +
        (callbackData.udf8 || "") +
        "|" +
        (callbackData.udf7 || "") +
        "|" +
        (callbackData.udf6 || "") +
        "|" +
        (callbackData.udf5 || "") +
        "|" +
        (callbackData.udf4 || "") +
        "|" +
        (callbackData.udf3 || "") +
        "|" +
        (callbackData.udf2 || "") +
        "|" +
        (callbackData.udf1 || "") +
        "|" +
        (callbackData.email || "") +
        "|" +
        (callbackData.firstname || "") +
        "|" +
        (callbackData.productinfo || "") +
        "|" +
        (callbackData.amount || "") + // Use original amount format from callback
        "|" +
        (callbackData.txnid || "") +
        "|" +
        merchantKey;

      // Generate and verify hash
      const computedHash = sha512.sha512(reverseHashString);
      const receivedHash = callbackData.hash;
      const isValid = computedHash === receivedHash;

      // Log verification result
      if (isValid) {
        logger.info("✅ Hash verification successful", {
          txnid: callbackData.txnid,
        });
      } else {
        logger.error("❌ Hash verification failed", {
          txnid: callbackData.txnid,
          receivedHash: receivedHash?.substring(0, 20) + "...",
          computedHash: computedHash.substring(0, 20) + "...",
        });
      }

      return {
        isValid,
        message: isValid ? "Hash verification successful" : "Hash verification failed",
      };
    } catch (error) {
      logger.error("Hash verification error", { error: error instanceof Error ? error.message : error });
      return {
        isValid: false,
        message: "Hash verification failed due to error",
      };
    }
  }

  /**
   * Get Easebuzz base URL based on environment
   */
  private getBaseUrl(): string {
    const env = this.config.getEnvironment();
    const baseUrl = env === "prod" ? "https://pay.easebuzz.in/" : "https://testpay.easebuzz.in/";

    console.log("🌐 Getting Easebuzz base URL:", {
      environment: env,
      baseUrl: baseUrl,
    });

    logger.info("🌐 Using Easebuzz base URL", { environment: env, baseUrl });
    return baseUrl;
  }

  /**
   * Validate amount format (must be float with up to 2 decimal places)
   */
  private isValidAmount(amount: string): boolean {
    const regexp = /^\d+\.\d{1,2}$/;
    const isValid = regexp.test(amount);
    console.log("💰 Amount validation:", { amount, isValid });
    return isValid;
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const regexp = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    const isValid = regexp.test(email);
    console.log("📧 Email validation:", { email, isValid });
    return isValid;
  }

  /**
   * Validate phone number according to Easebuzz documentation
   * Pattern: ^(\+\d{1,4}[-]?)?\d{5,20}$
   * Supports: +91xxxxxxxxxx, 91xxxxxxxxxx, xxxxxxxxxx (5-20 digits)
   */
  private isValidPhone(phone: string): boolean {
    // Easebuzz pattern: optional country code + 5-20 digits
    const easebuzzPattern = /^(\+\d{1,4}[-]?)?\d{5,20}$/;
    const isValid = easebuzzPattern.test(phone.trim());

    console.log("📞 Phone validation:", {
      phone: phone.substring(0, 5) + "*****",
      isValid,
      length: phone.length,
      pattern: "Easebuzz: ^(\\+\\d{1,4}[-]?)?\\d{5,20}$",
    });

    return isValid;
  }

  /**
   * Initiate payment using official Easebuzz flow
   */
  public async initiatePayment(
    bookingData: PaymentData,
    centerData: CenterData | null,
    amount?: number
  ): Promise<PaymentInitiationResult> {
    try {
      console.log("🚀 === PAYMENT INITIATION STARTED ===");
      console.log("🚀 Input data:", {
        bookingId: bookingData.id,
        bookingUid: bookingData.uid,
        amount: amount || bookingData.amount,
        userEmail: bookingData.userEmail,
        userName: bookingData.userName,
        userPhone: bookingData.userPhone,
        centerData: centerData ? { id: centerData.id, name: centerData.name } : null,
      });

      logger.info("🚀 Starting payment initiation", {
        bookingId: bookingData.id,
        bookingUid: bookingData.uid,
        amount: amount || bookingData.amount,
        userEmail: bookingData.userEmail,
        centerData: centerData ? { id: centerData.id, name: centerData.name } : null,
      });

      // Step 1: Validate configuration
      console.log(" Step 1: Validating Easebuzz configuration...");
      if (!this.config.isConfigured()) {
        console.error("Easebuzz not configured properly");
        logger.error("Easebuzz not configured");
        return {
          success: false,
          error: "Easebuzz payment gateway is not properly configured",
          message: "Configuration missing",
        };
      }
      console.log("✅ Step 1 complete: Configuration validated");

      // Step 2: Prepare amounts and transaction ID
      console.log(" Step 2: Preparing payment amounts and transaction ID...");
      const finalAmount = (amount || bookingData.amount).toFixed(2);
      const txnid = `appointly_${bookingData.id}_${Date.now()}`;

      console.log("✅ Step 2 complete:", { finalAmount, txnid });

      // Step 3: Validate required fields
      console.log(" Step 3: Validating required fields...");

      if (!bookingData.userName.trim()) {
        console.error("Step 3 failed: Name validation");
        return { success: false, error: "Mandatory Parameter name cannot be empty" };
      }

      if (!this.isValidAmount(finalAmount)) {
        console.error("Step 3 failed: Amount validation");
        return {
          success: false,
          error: "Mandatory Parameter amount cannot be empty and must be in decimal format",
        };
      }

      if (!bookingData.userEmail.trim() || !this.isValidEmail(bookingData.userEmail)) {
        console.error("Step 3 failed: Email validation");
        return { success: false, error: "Email validation failed. Please enter proper value for email" };
      }

      if (!bookingData.userPhone.trim() || !this.isValidPhone(bookingData.userPhone)) {
        console.error("Step 3 failed: Phone validation");
        return { success: false, error: "Phone validation failed. Please enter proper value for phone" };
      }
      console.log("✅ Step 3 complete: All fields validated");

      // Step 4: Prepare form data
      console.log(" Step 4: Preparing form data...");
      const formData: any = {
        key: this.config.getMerchantKey(),
        txnid: txnid,
        amount: finalAmount,
        email: bookingData.userEmail,
        phone: bookingData.userPhone,
        firstname: bookingData.userName,
        productinfo: bookingData.description || `${bookingData.title} - Consultation`,
        udf1: bookingData.uid, // Store booking UID for reference
        udf2: centerData?.id?.toString() || "",
        udf3: "",
        udf4: "",
        udf5: "",
        udf6: "",
        udf7: "",
        udf8: "",
        udf9: "",
        udf10: "",
        surl: `${this.webappUrl}/api/payments/easebuzz/success`,
        furl: `${this.webappUrl}/api/payments/easebuzz/failure`,
      };

      // Add sub-merchant ID if available
      if (centerData?.easebuzzSubMerchantId) {
        formData.sub_merchant_id = centerData.easebuzzSubMerchantId;
        console.log("🏢 Added sub-merchant ID:", centerData.easebuzzSubMerchantId);
      }

      console.log("✅ Step 4 complete: Form data prepared:", {
        key: formData.key?.substring(0, 10) + "***",
        txnid: formData.txnid,
        amount: formData.amount,
        email: formData.email,
        phone: formData.phone,
        firstname: formData.firstname,
        productinfo: formData.productinfo,
        udf1: formData.udf1,
        surl: formData.surl,
        furl: formData.furl,
      });

      // Step 5: Generate hash (FIXED - match official kit exactly)
      console.log(" Step 5: Generating hash...");
      const hash = this.generateHash({
        key: formData.key,
        txnid: formData.txnid,
        amount: formData.amount,
        productinfo: formData.productinfo,
        name: formData.firstname, // Official kit uses 'name' parameter but we pass firstname value
        email: formData.email,
        udf1: formData.udf1,
        udf2: formData.udf2,
        udf3: formData.udf3,
        udf4: formData.udf4,
        udf5: formData.udf5,
        udf6: formData.udf6,
        udf7: formData.udf7,
        udf8: formData.udf8,
        udf9: formData.udf9,
        udf10: formData.udf10,
        salt: this.config.getSalt(),
      });

      formData.hash = hash;
      console.log("✅ Step 5 complete: Hash generated and added to form data");

      // Step 6: Call initiateLink API
      console.log(" Step 6: Calling Easebuzz initiateLink API...");
      const baseUrl = this.getBaseUrl();
      const initiateUrl = `${baseUrl}payment/initiateLink`;

      console.log("📡 Making API call to:", initiateUrl);
      console.log("📡 With form data keys:", Object.keys(formData));

      logger.info("📡 Calling Easebuzz initiateLink API", {
        url: initiateUrl,
        txnid: formData.txnid,
        amount: formData.amount,
        email: formData.email,
        phone: formData.phone,
        surl: formData.surl,
        furl: formData.furl,
      });

      console.log(" Step 6a: About to make HTTP request...");
      const response = await this.makeRequest(initiateUrl, formData);
      console.log(" Step 6b: HTTP request completed");

      console.log("📨 Raw Easebuzz response:", {
        response: response,
        status: response?.status,
        data: response?.data,
        error: response?.error,
      });

      logger.info("📨 Easebuzz initiateLink response", {
        success: response.status === 1,
        data: response.data,
        error: response.error,
        fullResponse: response,
      });

      // Step 7: Validate response
      console.log(" Step 7: Validating Easebuzz response...");
      if (response.status !== 1 || !response.data) {
        console.error("Step 7 failed: Invalid response from Easebuzz:", {
          status: response.status,
          data: response.data,
          error: response.error,
        });
        return {
          success: false,
          error: response.error || "Failed to initiate payment",
          message: "Easebuzz API returned error",
          response: response,
        };
      }
      console.log("✅ Step 7 complete: Response validated");

      // Step 8: Generate final payment URL
      console.log(" Step 8: Generating final payment URL...");
      const accessKey = response.data;
      const paymentUrl = `${baseUrl}pay/${accessKey}`;

      console.log("🔑 ACCESS KEY RECEIVED:", {
        accessKey: accessKey,
        accessKeyLength: accessKey?.length || 0,
        accessKeyPreview: accessKey?.substring(0, 20) + "...",
        baseUrl: baseUrl,
        finalPaymentUrl: paymentUrl,
      });

      logger.info("✅ Payment initiation successful", {
        txnid: formData.txnid,
        accessKey: accessKey.substring(0, 20) + "...",
        paymentUrl: paymentUrl,
        baseUrl: baseUrl,
      });

      console.log("✅ Step 8 complete: Payment URL generated");
      console.log(" === PAYMENT INITIATION COMPLETED SUCCESSFULLY ===");

      return {
        success: true,
        transactionId: formData.txnid,
        txnid: formData.txnid,
        paymentUrl: paymentUrl,
        accessKey: accessKey,
        response: response,
        message: "Payment initiated successfully",
      };
    } catch (error) {
      console.error("💥 === PAYMENT INITIATION FAILED ===");
      console.error("💥 Error details:", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        bookingId: bookingData.id,
      });

      logger.error("💥 Payment initiation failed", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        bookingId: bookingData.id,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        message: "Payment initiation failed due to unexpected error",
      };
    }
  }

  /**
   * Make HTTP request to Easebuzz API
   */
  private async makeRequest(url: string, data: any): Promise<any> {
    try {
      console.log("🌐 makeRequest: Starting HTTP request");
      console.log("🌐 URL:", url);
      console.log("🌐 Data keys:", Object.keys(data));

      // Convert data to URL-encoded format (as per official implementation)
      const formBody = Object.keys(data)
        .map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(data[key]))
        .join("&");

      console.log("🌐 Form body prepared, length:", formBody.length);
      console.log("🌐 Form body preview:", formBody.substring(0, 200) + "...");

      logger.info("🌐 Making API request", {
        url: url,
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        bodyLength: formBody.length,
      });

      console.log("🌐 About to call fetch...");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody,
      });
      console.log("🌐 Fetch completed, processing response...");

      const responseText = await response.text();
      console.log("🌐 Response text received, length:", responseText.length);
      console.log("🌐 Response text preview:", responseText.substring(0, 200) + "...");

      logger.info("📥 API response received", {
        status: response.status,
        statusText: response.statusText,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 200) + "...",
      });

      if (!response.ok) {
        console.error("🌐 HTTP response not OK:", response.status, response.statusText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log("🌐 Parsing JSON response...");
      const jsonResponse = JSON.parse(responseText);
      console.log("🌐 JSON parsed successfully:", jsonResponse);

      return jsonResponse;
    } catch (error) {
      console.error("🚨 makeRequest failed:", {
        url: url,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      logger.error("🚨 API request failed", {
        url: url,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Handle payment callbacks (success/failure)
   */
  public async handleCallback(callbackData: any): Promise<{
    status: EasebuzzPaymentStatus;
    message: string;
    isValid: boolean;
  }> {
    try {
      logger.info("📞 Processing payment callback", {
        txnid: callbackData.txnid,
        status: callbackData.status,
        amount: callbackData.amount,
        email: callbackData.email,
      });

      // Verify hash first
      const verification = await this.verifyPayment(callbackData);
      if (!verification.isValid) {
        logger.error("Hash verification failed for callback", {
          txnid: callbackData.txnid,
          receivedHash: callbackData.hash,
        });
        return {
          status: EasebuzzPaymentStatus.FAILURE,
          message: "Hash verification failed",
          isValid: false,
        };
      }

      // Map Easebuzz status to our enum
      let status: EasebuzzPaymentStatus;
      switch (callbackData.status?.toLowerCase()) {
        case "success":
          status = EasebuzzPaymentStatus.SUCCESS;
          break;
        case "failure":
          status = EasebuzzPaymentStatus.FAILURE;
          break;
        case "cancelled":
          status = EasebuzzPaymentStatus.CANCELLED;
          break;
        default:
          status = EasebuzzPaymentStatus.FAILURE;
      }

      logger.info("✅ Callback processed successfully", {
        txnid: callbackData.txnid,
        mappedStatus: status,
        originalStatus: callbackData.status,
      });

      return {
        status,
        message: `Payment ${status.toLowerCase()}`,
        isValid: true,
      };
    } catch (error) {
      logger.error("💥 Callback processing failed", {
        error: error instanceof Error ? error.message : error,
        callbackData: callbackData,
      });

      return {
        status: EasebuzzPaymentStatus.FAILURE,
        message: "Callback processing failed",
        isValid: false,
      };
    }
  }
}

export default EasebuzzService;
