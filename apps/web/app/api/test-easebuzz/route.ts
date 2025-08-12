import { NextRequest, NextResponse } from "next/server";

import { debugEasebuzzPayments } from "@calcom/lib/easebuzz-debug";

/**
 * Test API endpoint for Easebuzz integration
 *
 * GET /api/test-easebuzz
 *
 * This endpoint runs diagnostics on your Easebuzz integration
 * and returns the results. Use this to debug configuration issues.
 */
export async function GET(req: NextRequest) {
  try {
    console.log("🔍 Running Easebuzz diagnostics via API...");

    const results = await debugEasebuzzPayments();

    return NextResponse.json({
      success: results.overallStatus === "READY",
      status: results.overallStatus,
      environment: results.environment,
      configuration: results.configuration,
      hashGeneration: results.hashGeneration,
      apiConnectivity: results.apiConnectivity,
      recommendations: results.recommendations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Easebuzz test API failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      error: "Only GET requests are supported for this test endpoint",
    },
    { status: 405 }
  );
}
