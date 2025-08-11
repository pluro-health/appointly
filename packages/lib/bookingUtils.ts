export type PaymentButtonOptions = {
  showPayNow: boolean;
  showPayLater: boolean;
  isRemoteOnly: boolean;
  isPhysicalLocation: boolean;
};

/**
 * Determines what payment buttons should be shown based on selected location
 * @param selectedLocation - The location object that the user has selected
 * @returns PaymentButtonOptions - Object indicating which buttons to show
 */
export function getPaymentButtonOptionsForSelected(
  selectedLocation: any | null | undefined
): PaymentButtonOptions {
  if (!selectedLocation) {
    // No location selected - default to Pay Now only
    return { showPayNow: true, showPayLater: false, isRemoteOnly: false, isPhysicalLocation: false };
  }

  const locationType = selectedLocation.type || selectedLocation.value;

  // Check for remote locations (phone/video) - Pay Now only
  if (
    locationType === "phone" ||
    locationType === "userPhone" ||
    locationType === "conferencing" ||
    locationType?.startsWith("integrations:") ||
    locationType?.includes("_video") ||
    locationType?.includes("_conferencing")
  ) {
    return { showPayNow: true, showPayLater: false, isRemoteOnly: true, isPhysicalLocation: false };
  }

  // Check for physical locations - Both Pay Now and Pay Later
  if (
    locationType === "inPerson" ||
    locationType === "attendeeInPerson" ||
    locationType === "link" ||
    locationType === "somewhereElse"
  ) {
    return { showPayNow: true, showPayLater: true, isRemoteOnly: false, isPhysicalLocation: true };
  }

  // Fallback - default to Pay Now only
  return { showPayNow: true, showPayLater: false, isRemoteOnly: false, isPhysicalLocation: false };
}

/**
 * Determines what payment buttons should be shown based on all available location types
 * @param locations - Array of location objects from an event type
 * @returns PaymentButtonOptions - Object indicating which buttons to show
 * @deprecated Use getPaymentButtonOptionsForSelected for user selection based logic
 */
export function getPaymentButtonOptions(locations: any[] | null | undefined): PaymentButtonOptions {
  if (!locations || !Array.isArray(locations)) {
    return { showPayNow: false, showPayLater: false, isRemoteOnly: false, isPhysicalLocation: false };
  }

  let hasRemoteLocation = false;
  let hasPhysicalLocation = false;

  locations.forEach((location: any) => {
    const locationType = location.type;

    // Check for remote locations (phone/video)
    if (
      locationType === "phone" ||
      locationType === "userPhone" ||
      locationType === "conferencing" ||
      locationType?.startsWith("integrations:") ||
      locationType?.includes("_video") ||
      locationType?.includes("_conferencing")
    ) {
      hasRemoteLocation = true;
    }

    // Check for physical locations
    if (
      locationType === "inPerson" ||
      locationType === "attendeeInPerson" ||
      locationType === "link" ||
      locationType === "somewhereElse"
    ) {
      hasPhysicalLocation = true;
    }
  });

  // Determine which buttons to show
  if (hasRemoteLocation && !hasPhysicalLocation) {
    // Only remote locations - Pay Now only
    return { showPayNow: true, showPayLater: false, isRemoteOnly: true, isPhysicalLocation: false };
  } else if (hasPhysicalLocation && !hasRemoteLocation) {
    // Only physical locations - Both Pay Now and Pay Later
    return { showPayNow: true, showPayLater: true, isRemoteOnly: false, isPhysicalLocation: true };
  } else if (hasRemoteLocation && hasPhysicalLocation) {
    // Mixed locations - Both options available
    return { showPayNow: true, showPayLater: true, isRemoteOnly: false, isPhysicalLocation: true };
  }

  // Fallback - no specific location detected
  return { showPayNow: true, showPayLater: false, isRemoteOnly: false, isPhysicalLocation: false };
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use getPaymentButtonOptions instead
 */
export function shouldShowPayNow(locations: any[] | null | undefined): boolean {
  const options = getPaymentButtonOptions(locations);
  return options.showPayNow && !options.showPayLater;
}

/**
 * Gets the appropriate payment button text for single-button scenarios
 * @param locations - Array of location objects from an event type
 * @param isPaidEvent - Whether the event requires payment
 * @param t - Translation function
 * @returns string - "pay_now", "pay_later", or "confirm"
 */
export function getPaymentButtonText(
  locations: any[] | null | undefined,
  isPaidEvent: boolean,
  t: (key: string) => string
): string {
  if (!isPaidEvent) {
    return t("confirm");
  }

  const options = getPaymentButtonOptions(locations);

  // For single button scenarios
  if (options.isRemoteOnly) {
    return t("pay_now");
  }

  // Default to Pay Now for backwards compatibility
  return t("pay_now");
}
