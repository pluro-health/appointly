import { z } from "zod";

import { templateTypeEnum } from "@calcom/features/ee/cal-ai-phone/zod-utils";
import { MAX_SEATS_PER_TIME_SLOT } from "@calcom/lib/constants";
import { _DestinationCalendarModel, _EventTypeModel } from "@calcom/prisma/zod";
import {
  customInputSchema,
  EventTypeMetaDataSchema,
  stringOrNumber,
  rrSegmentQueryValueSchema,
} from "@calcom/prisma/zod-utils";
import { eventTypeBookingFields } from "@calcom/prisma/zod-utils";

const hashedLinkInputSchema = z
  .object({
    link: z.string(),
    expiresAt: z.date().nullish(),
    maxUsageCount: z.number().nullish(),
    usageCount: z.number().nullish(),
  })
  .strict();

const aiPhoneCallConfig = z
  .object({
    generalPrompt: z.string(),
    enabled: z.boolean(),
    beginMessage: z.string().nullable(),
    yourPhoneNumber: z.string(),
    numberToCall: z.string(),
    guestName: z.string().nullable().optional(),
    guestEmail: z.string().nullable().optional(),
    guestCompany: z.string().nullable().optional(),
    templateType: templateTypeEnum,
  })
  .optional();

const calVideoSettingsSchema = z
  .object({
    disableRecordingForGuests: z.boolean().nullish(),
    disableRecordingForOrganizer: z.boolean().nullish(),
    enableAutomaticTranscription: z.boolean().nullish(),
    enableAutomaticRecordingForOrganizer: z.boolean().nullish(),
    disableTranscriptionForGuests: z.boolean().nullish(),
    disableTranscriptionForOrganizer: z.boolean().nullish(),
    redirectUrlOnExit: z.string().url().nullish(),
  })
  .optional()
  .nullable();

const hostSchema = z.object({
  userId: z.number(),
  profileId: z.number().or(z.null()).optional(),
  isFixed: z.boolean().optional(),
  priority: z.number().min(0).max(4).optional().nullable(),
  weight: z.number().min(0).optional().nullable(),
  scheduleId: z.number().optional().nullable(),
});

const childSchema = z.object({
  owner: z.object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    eventTypeSlugs: z.array(z.string()),
  }),
  hidden: z.boolean(),
});

/** Optional fields */
const BaseEventTypeUpdateInput = _EventTypeModel
  .extend({
    isInstantEvent: z.boolean(),
    instantMeetingParameters: z.array(z.string()),
    instantMeetingExpiryTimeOffsetInSeconds: z.number(),
    aiPhoneCallConfig,
    calVideoSettings: calVideoSettingsSchema,
    calAiPhoneScript: z.string(),
    customInputs: z.array(customInputSchema),
    destinationCalendar: _DestinationCalendarModel
      .pick({
        integration: true,
        externalId: true,
      })
      .nullable(),
    users: z.array(stringOrNumber),
    children: z.array(childSchema),
    hosts: z.array(hostSchema),
    schedule: z.number().nullable(),
    instantMeetingSchedule: z.number().nullable(),
    multiplePrivateLinks: z.array(z.union([z.string(), hashedLinkInputSchema])),
    assignAllTeamMembers: z.boolean(),
    isRRWeightsEnabled: z.boolean(),
    metadata: EventTypeMetaDataSchema,
    bookingFields: eventTypeBookingFields,
    assignRRMembersUsingSegment: z.boolean().optional(),
    rrSegmentQueryValue: rrSegmentQueryValueSchema.optional(),
    useEventLevelSelectedCalendars: z.boolean().optional(),
    seatsPerTimeSlot: z.number().min(1).max(MAX_SEATS_PER_TIME_SLOT).nullable().optional(),
    // Payment fields for consultation fees
    consultationPrice: z.number().min(0).max(999999.99).multipleOf(0.01).nullable().optional(),
    paymentCurrency: z.string().min(3).max(3).optional(),
    requiresPayment: z.boolean().optional(),
  })
  .partial()
  .extend(_EventTypeModel.pick({ id: true }).shape);

export const ZUpdateInputSchema = BaseEventTypeUpdateInput.extend({
  aiPhoneCallConfig: aiPhoneCallConfig.refine(
    (data) => {
      if (!data) return true;
      data.yourPhoneNumber = data.yourPhoneNumber || "";
      data.numberToCall = data.numberToCall || "";
      data.guestName = data.guestName ?? undefined;
      data.guestEmail = data.guestEmail ?? null;
      data.guestCompany = data.guestCompany ?? null;
      return true;
    },
    {
      message: "Applying default values and transformations",
    }
  ),
})
  .strict()
  .refine(
    (data) => {
      // Payment validation: consultationPrice required when requiresPayment is enabled
      if (data.requiresPayment === true && (!data.consultationPrice || data.consultationPrice <= 0)) {
        return false;
      }
      return true;
    },
    {
      message: "Consultation price is required and must be greater than 0 when payment is enabled",
      path: ["consultationPrice"],
    }
  )
  .refine(
    (data) => {
      // Payment validation: requiresPayment must be disabled if consultationPrice is null/0
      if (data.consultationPrice === null || data.consultationPrice === 0) {
        if (data.requiresPayment === true) {
          return false;
        }
      }
      return true;
    },
    {
      message: "Payment cannot be required when consultation price is not set",
      path: ["requiresPayment"],
    }
  );
// only run infer over the simple type, excluding refines/transforms.
export type TUpdateInputSchema = z.infer<typeof BaseEventTypeUpdateInput>;
