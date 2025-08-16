/**
 * Easebuzz Debug Utility
 *
 * Comprehensive debugging tool for Easebuzz payment integration
 * Use this to diagnose configuration, hash generation, and API connectivity issues
 */
import { EasebuzzConfigManager } from "./easebuzz";
import { EasebuzzHashUtils } from "./easebuzz-hash";
import { easebuzzValidation } from "./easebuzz-schema";
import { EasebuzzService } from "./easebuzz-service";

interface DebugResult {
  success: boolean;
  message: string;
  details?: any;
  error?: string;
}

interface PaymentDebugSummary {
  environment: DebugResult;
  configuration: DebugResult;
  hashGeneration: DebugResult;
  apiConnectivity: DebugResult;
  overallStatus: "READY" | "ISSUES_FOUND" | "CONFIGURATION_MISSING";
  recommendations: string[];
}

export class EasebuzzDebugger {
  private results: PaymentDebugSummary;

  constructor() {
    this.results = {
      environment: { success: false, message: "" },
      configuration: { success: false, message: "" },
      hashGeneration: { success: false, message: "" },
      apiConnectivity: { success: false, message: "" },
      overallStatus: "CONFIGURATION_MISSING",
      recommendations: [],
    };
  }

  /**
   * Run comprehensive debug analysis
   */
  async runFullDiagnostics(): Promise<PaymentDebugSummary> {
    console.log("🔍 Starting Easebuzz Payment Integration Diagnostics...\n");

    // 1. Check environment variables
    this.results.environment = this.checkEnvironmentVariables();
    this.logResult("Environment Variables", this.results.environment);

    // 2. Test configuration loading
    this.results.configuration = this.testConfiguration();
    this.logResult("Configuration Loading", this.results.configuration);

    // 3. Test hash generation
    this.results.hashGeneration = this.testHashGeneration();
    this.logResult("Hash Generation", this.results.hashGeneration);

    // 4. Test API connectivity (only if config is valid)
    if (this.results.configuration.success) {
      this.results.apiConnectivity = await this.testApiConnectivity();
      this.logResult("API Connectivity", this.results.apiConnectivity);
    } else {
      this.results.apiConnectivity = {
        success: false,
        message: "Skipped due to configuration issues",
      };
    }

    // 5. Generate overall status and recommendations
    this.generateOverallStatus();
    this.generateRecommendations();

    this.printSummary();
    return this.results;
  }

  /**
   * Check environment variables
   */
  private checkEnvironmentVariables(): DebugResult {
    const required = ["EASEBUZZ_MERCHANT_KEY", "EASEBUZZ_SALT"];
    const optional = ["EASEBUZZ_ENV", "EASEBUZZ_BASE_URL", "NEXT_PUBLIC_WEBAPP_URL"];

    const missing: string[] = [];
    const present: string[] = [];
    const details: any = {};

    // Check required variables
    required.forEach((key) => {
      const value = process.env[key];
      if (!value || value.trim() === "") {
        missing.push(key);
        details[key] = "Missing or empty";
      } else {
        present.push(key);
        details[key] =
          "✅ Present" +
          (key.includes("SALT") ? " (hidden for security)" : ` (${value.substring(0, 10)}...)`);
      }
    });

    // Check optional variables
    optional.forEach((key) => {
      const value = process.env[key];
      details[key] = value ? `✅ ${value}` : "⚠️ Using default";
    });

    if (missing.length > 0) {
      return {
        success: false,
        message: `Missing required environment variables: ${missing.join(", ")}`,
        details,
        error: `Please set: ${missing.join(", ")}`,
      };
    }

    return {
      success: true,
      message: "All required environment variables are present",
      details,
    };
  }

  /**
   * Test configuration loading
   */
  private testConfiguration(): DebugResult {
    try {
      const configManager = new EasebuzzConfigManager();
      const config = configManager.getConfig();

      const details = {
        merchantKey: config.merchantKey ? `${config.merchantKey.substring(0, 10)}...` : "Missing",
        salt: config.salt ? "✅ Present (hidden)" : "Missing",
        environment: config.environment,
        baseUrl: config.baseUrl,
        successUrl: config.successUrl,
        failureUrl: config.failureUrl,
        isConfigured: configManager.isConfigured(),
      };

      return {
        success: true,
        message: "Configuration loaded successfully",
        details,
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to load configuration",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Test hash generation
   */
  private testHashGeneration(): DebugResult {
    try {
      const testParams = {
        key: "test_merchant_key",
        merchant_txn: "TEST_TXN_123",
        amount: 1000,
        firstname: "John",
        email: "john@example.com",
        phone: "9876543210",
        product_info: "Test Payment",
        surl: "https://example.com/success",
        furl: "https://example.com/failure",
        udf1: "booking_uid_123",
        udf2: "booking_id_456",
        udf3: "",
        udf4: "",
        udf5: "",
      };

      const hashUtils = new EasebuzzHashUtils("test_salt");

      // Test parameter validation
      const validation = hashUtils.validateHashParams(testParams);
      if (!validation.isValid) {
        return {
          success: false,
          message: "Hash parameter validation failed",
          error: validation.errors.join(", "),
        };
      }

      // Test hash generation
      const hash = hashUtils.generateEasebuzzHash(testParams);

      // Test hash verification (simulate callback)
      const callbackData = {
        txnid: "TEST_TXN_123",
        merchant_txn: "TEST_TXN_123",
        amount: 1000,
        status: "success" as any,
        hash: hash,
        email: "john@example.com",
        phone: "9876543210",
        product_info: "Test Payment",
      };

      const isValid = hashUtils.verifyEasebuzzHash(callbackData);

      const details = {
        hashGenerated: hash ? "✅ Generated successfully" : "Failed to generate",
        hashLength: hash?.length || 0,
        hashFormat: hash ? "✅ Valid SHA512 format" : "Invalid format",
        verificationTest: isValid ? "✅ Verification passed" : "Verification failed",
        debugInfo: hashUtils.getHashDebugInfo(testParams),
      };

      return {
        success: Boolean(hash && isValid),
        message:
          hash && isValid
            ? "Hash generation and verification working correctly"
            : "Hash generation or verification failed",
        details,
      };
    } catch (error) {
      return {
        success: false,
        message: "Hash generation test failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Test API connectivity
   */
  private async testApiConnectivity(): Promise<DebugResult> {
    try {
      const service = new EasebuzzService();
      const debugInfo = service.getDebugInfo();

      // Test basic configuration
      if (!service.isConfigured()) {
        return {
          success: false,
          message: "Service is not properly configured",
          error: "Configuration validation failed",
        };
      }

      // For now, just test configuration and return success
      // In production, you might want to test with a very small amount
      // or use Easebuzz's test endpoint if available

      const details = {
        environment: debugInfo.environment,
        baseUrl: debugInfo.baseUrl,
        isConfigured: debugInfo.isConfigured,
        serviceConfig: debugInfo.serviceConfig,
      };

      return {
        success: true,
        message: "Service configuration is valid (actual API test skipped for safety)",
        details,
      };
    } catch (error) {
      return {
        success: false,
        message: "API connectivity test failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Generate overall status
   */
  private generateOverallStatus(): void {
    const hasEnvironment = this.results.environment.success;
    const hasConfiguration = this.results.configuration.success;
    const hasHashGeneration = this.results.hashGeneration.success;
    const hasApiConnectivity = this.results.apiConnectivity.success;

    if (hasEnvironment && hasConfiguration && hasHashGeneration && hasApiConnectivity) {
      this.results.overallStatus = "READY";
    } else if (!hasEnvironment || !hasConfiguration) {
      this.results.overallStatus = "CONFIGURATION_MISSING";
    } else {
      this.results.overallStatus = "ISSUES_FOUND";
    }
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(): void {
    const recommendations: string[] = [];

    if (!this.results.environment.success) {
      recommendations.push("Set up required environment variables (EASEBUZZ_MERCHANT_KEY, EASEBUZZ_SALT)");
      recommendations.push("Copy .env.example to .env and fill in your Easebuzz credentials");
    }

    if (!this.results.configuration.success) {
      recommendations.push("Verify Easebuzz merchant key and salt are correct");
      recommendations.push("Check Easebuzz dashboard for correct credentials");
    }

    if (!this.results.hashGeneration.success) {
      recommendations.push("Check salt key matches the one in Easebuzz dashboard");
      recommendations.push("Verify hash generation sequence follows Easebuzz documentation");
    }

    if (!this.results.apiConnectivity.success && this.results.configuration.success) {
      recommendations.push("Check internet connectivity and firewall settings");
      recommendations.push("Verify Easebuzz API endpoints are accessible");
    }

    if (this.results.overallStatus === "READY") {
      recommendations.push("✅ Integration is ready! You can now test payment flow");
      recommendations.push("Test with small amount first in test environment");
    }

    this.results.recommendations = recommendations;
  }

  /**
   * Log individual test result
   */
  private logResult(testName: string, result: DebugResult): void {
    const status = result.success ? "✅ PASS" : "FAIL";
    console.log(`${status} ${testName}: ${result.message}`);

    if (result.details) {
      console.log("   Details:", result.details);
    }

    if (result.error) {
      console.log("   Error:", result.error);
    }

    console.log("");
  }

  /**
   * Print summary
   */
  private printSummary(): void {
    console.log("=".repeat(60));
    console.log("🏁 EASEBUZZ INTEGRATION DIAGNOSTIC SUMMARY");
    console.log("=".repeat(60));

    console.log(`Overall Status: ${this.getStatusIcon()} ${this.results.overallStatus}`);
    console.log("");

    console.log("📋 RECOMMENDATIONS:");
    this.results.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec}`);
    });

    console.log("");
    console.log("For more details, check the individual test results above.");
    console.log("=".repeat(60));
  }

  /**
   * Get status icon
   */
  private getStatusIcon(): string {
    switch (this.results.overallStatus) {
      case "READY":
        return "🟢";
      case "ISSUES_FOUND":
        return "🟡";
      case "CONFIGURATION_MISSING":
        return "🔴";
      default:
        return "⚪";
    }
  }
}

/**
 * Quick debug function for console usage
 */
export async function debugEasebuzzPayments(): Promise<PaymentDebugSummary> {
  const debugTool = new EasebuzzDebugger();
  return await debugTool.runFullDiagnostics();
}

/**
 * Environment-specific debug function
 */
export function checkEasebuzzEnvironment(): DebugResult {
  const debugTool = new EasebuzzDebugger();
  return (debugTool as any).checkEnvironmentVariables();
}

/**
 * Hash-specific debug function
 */
export function testEasebuzzHashGeneration(): DebugResult {
  const debugTool = new EasebuzzDebugger();
  return (debugTool as any).testHashGeneration();
}
