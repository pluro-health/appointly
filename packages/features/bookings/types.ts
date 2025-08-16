import type { SchedulingType } from "@prisma/client";
import type { ErrorOption, FieldPath } from "react-hook-form";

import type { BookingCreateBody } from "@calcom/prisma/zod/custom/booking";
import type { RouterOutputs } from "@calcom/trpc/react";
import type { AppsStatus } from "@calcom/types/Calendar";

import type { DatePickerProps } from "../calendars/DatePicker";

export type PublicEvent = NonNullable<RouterOutputs["viewer"]["public"]["event"]>;

export type BookerEventQuery = {
  isSuccess: boolean;
  isError: boolean;
  isPending: boolean;
  data?: BookerEvent | null;
};

type BookerEventUser = Pick<
  PublicEvent["subsetOfUsers"][number],
  "name" | "username" | "avatarUrl" | "weekStart" | "profile"
> & {
  metadata?: undefined;
  brandColor?: string | null;
  darkBrandColor?: string | null;
  bookerUrl: string;
};

type BookerEventProfile = Pick<PublicEvent["profile"], "name" | "image" | "bookerLayouts">;

// marked as required to keep responsibility on consumers to handle the case where slots is undefined
export type Slots = Required<NonNullable<DatePickerProps["slots"]>>;

export type BookerEvent = {
  id: PublicEvent["id"];
  length: PublicEvent["length"];
  slug: PublicEvent["slug"];
  schedulingType: PublicEvent["schedulingType"];
  recurringEvent: PublicEvent["recurringEvent"];
  entity: PublicEvent["entity"];
  locations: PublicEvent["locations"];
  metadata: PublicEvent["metadata"];
  isDynamic: PublicEvent["isDynamic"];
  requiresConfirmation: PublicEvent["requiresConfirmation"];
  price: PublicEvent["price"];
  currency: PublicEvent["currency"];
  lockTimeZoneToggleOnBookingPage: PublicEvent["lockTimeZoneToggleOnBookingPage"];
  lockedTimeZone: PublicEvent["lockedTimeZone"];
  schedule: PublicEvent["schedule"];
  seatsPerTimeSlot: PublicEvent["seatsPerTimeSlot"];
  title: PublicEvent["title"];
  description: PublicEvent["description"];
  forwardParamsSuccessRedirect: PublicEvent["forwardParamsSuccessRedirect"];
  successRedirectUrl: PublicEvent["successRedirectUrl"];
  subsetOfHosts: PublicEvent["subsetOfHosts"];
  bookingFields: PublicEvent["bookingFields"];
  seatsShowAvailabilityCount: PublicEvent["seatsShowAvailabilityCount"];
  isInstantEvent: PublicEvent["isInstantEvent"];
  instantMeetingParameters: PublicEvent["instantMeetingParameters"];
  fieldTranslations: PublicEvent["fieldTranslations"];
  autoTranslateDescriptionEnabled: PublicEvent["autoTranslateDescriptionEnabled"];
  disableCancelling: PublicEvent["disableCancelling"];
  disableRescheduling: PublicEvent["disableRescheduling"];
  interfaceLanguage: PublicEvent["interfaceLanguage"];
  consultationPrice?: number | null;
  paymentCurrency?: string;
  requiresPayment?: boolean;
  subsetOfUsers: BookerEventUser[];
  showInstantEventConnectNowModal: boolean;
  profile: BookerEventProfile;
};

export type ValidationErrors<T extends object> = { key: FieldPath<T>; error: ErrorOption }[];

export type EventPrice = { currency: string; price: number; displayAlternateSymbol?: boolean };

export enum EventDetailBlocks {
  // Includes duration select when event has multiple durations.
  DURATION,
  LOCATION,
  REQUIRES_CONFIRMATION,
  // Includes input to select # of occurrences.
  OCCURENCES,
  PRICE,
}

export type { BookingCreateBody };

export type RecurringBookingCreateBody = BookingCreateBody & {
  noEmail?: boolean;
  recurringCount?: number;
  appsStatus?: AppsStatus[] | undefined;
  allRecurringDates?: Record<string, string>[];
  currentRecurringIndex?: number;
  schedulingType?: SchedulingType;
};

export type BookingResponse = Awaited<
  ReturnType<typeof import("@calcom/features/bookings/lib/handleNewBooking").default>
>;

export type InstantBookingResponse = Awaited<
  ReturnType<typeof import("@calcom/features/instant-meeting/handleInstantMeeting").default>
>;

export type MarkNoShowResponse = Awaited<
  ReturnType<typeof import("@calcom/features/handleMarkNoShow").default>
>;
