import { BookingStatus } from "@prisma/client";
import { Request } from "express";

import dayjs from "@calcom/dayjs";
import { sendRescheduledEmailsAndSMS } from "@calcom/emails";
import { getAllCredentialsIncludeServiceAccountKey } from "@calcom/features/bookings/lib/getAllCredentialsForUsersOnEvent/getAllCredentials";
import { addVideoCallDataToEvent } from "@calcom/features/bookings/lib/handleNewBooking/addVideoCallDataToEvent";
import EventManager from "@calcom/lib/EventManager";
import { CalendarEventBuilder } from "@calcom/lib/builders/CalendarEvent/builder";
import { CalendarEventDirector } from "@calcom/lib/builders/CalendarEvent/director";
import logger from "@calcom/lib/logger";
import { getTranslation } from "@calcom/lib/server/i18n";
import { prisma } from "@calcom/prisma";

import {
  canRescheduleBooking,
  hasBookingModifyPermission,
  validateRescheduleTimeSlot,
} from "./appointly-business-rules";

interface AppointlyRescheduleRequest {
  bookingId: number;
  newStartTime: Date;
  newEndTime: Date;
  timeZone: string;
  reason?: string;
  userId?: number;
  userEmail?: string;
}

interface AppointlyRescheduleResponse {
  success: boolean;
  message: string;
  bookingUid?: string;
  newBookingId?: number;
  errors?: string[];
}

/**
 * Service for handling appointly-specific reschedule logic
 * Extends existing Cal.com reschedule functionality with business rules
 */
export class AppointlyRescheduleHandler {
  private log = logger.getSubLogger({ prefix: ["AppointlyRescheduleHandler"] });

  /**
   * Validate and process a reschedule request with appointly business rules
   */
  async handleReschedule(request: AppointlyRescheduleRequest): Promise<AppointlyRescheduleResponse> {
    const { bookingId, newStartTime, newEndTime, timeZone, reason, userId, userEmail } = request;

    this.log.info("Processing reschedule request", {
      bookingId,
      newStartTime,
      newEndTime,
      timeZone,
      userId,
    });

    try {
      // 1. Get the booking with all necessary relations
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: {
          attendees: true,
          user: true,
          eventType: true,
          easebuzzPayment: true,
        },
      });

      // 2. Check user permissions
      const permissionCheck = hasBookingModifyPermission(booking, userId, userEmail);
      if (!permissionCheck.hasPermission) {
        return {
          success: false,
          message: permissionCheck.reason || "Permission denied",
          errors: ["PERMISSION_DENIED"],
        };
      }

      // 3. Validate reschedule eligibility based on appointly business rules
      const eligibilityCheck = canRescheduleBooking(booking);
      if (!eligibilityCheck.canReschedule) {
        return {
          success: false,
          message: eligibilityCheck.reason || "Reschedule not allowed",
          errors: ["RESCHEDULE_NOT_ALLOWED"],
        };
      }

      // 4. Validate new time slot
      const timeSlotValidation = validateRescheduleTimeSlot(newStartTime, newEndTime);
      if (!timeSlotValidation.isValid) {
        return {
          success: false,
          message: timeSlotValidation.reason || "Invalid time slot",
          errors: ["INVALID_TIME_SLOT"],
        };
      }

      // 5. Check if new time slot is available (delegate to existing Cal.com logic)
      const availabilityCheck = await this.checkSlotAvailability(
        booking.eventTypeId!,
        newStartTime,
        newEndTime,
        timeZone
      );

      if (!availabilityCheck.isAvailable) {
        return {
          success: false,
          message: "The selected time slot is not available",
          errors: ["SLOT_NOT_AVAILABLE"],
        };
      }

      // 6. Create reschedule by calling existing Cal.com reschedule service
      const rescheduleResult = await this.performReschedule(booking, {
        newStartTime,
        newEndTime,
        timeZone,
        reason,
        userRole: permissionCheck.role,
      });

      if (!rescheduleResult.success) {
        return {
          success: false,
          message: rescheduleResult.message || "Reschedule failed",
          errors: ["RESCHEDULE_FAILED"],
        };
      }

      // 7. Update appointly-specific fields
      const bookingWithAppointlyFields = booking as any;
      await this.updateAppointlyFields(booking.id, {
        newStartTime,
        originalBookingDate: bookingWithAppointlyFields.appointlyOriginalBookingDate || booking.startTime,
        rescheduleCount: (bookingWithAppointlyFields.appointlyRescheduleCount || 0) + 1,
        reason,
      });

      this.log.info("Reschedule completed successfully", {
        bookingId: booking.id,
        newBookingId: rescheduleResult.newBookingId,
        rescheduleCount: (bookingWithAppointlyFields.appointlyRescheduleCount || 0) + 1,
      });

      return {
        success: true,
        message: "Booking rescheduled successfully",
        bookingUid: rescheduleResult.bookingUid,
        newBookingId: rescheduleResult.newBookingId,
      };
    } catch (error: any) {
      this.log.error("Reschedule failed", {
        bookingId,
        error: error?.message || error,
      });

      return {
        success: false,
        message: "An error occurred while rescheduling the booking",
        errors: ["INTERNAL_ERROR"],
      };
    }
  }

  /**
   * Check if a time slot is available for the given event type
   * This integrates with existing Cal.com availability checking
   */
  private async checkSlotAvailability(
    eventTypeId: number,
    startTime: Date,
    endTime: Date,
    timeZone: string
  ): Promise<{ isAvailable: boolean; reason?: string }> {
    // TODO: Integrate with existing Cal.com availability checking logic
    // For now, we'll do a basic check for existing bookings

    try {
      const conflictingBooking = await prisma.booking.findFirst({
        where: {
          eventTypeId,
          status: {
            not: BookingStatus.CANCELLED,
          },
          OR: [
            {
              startTime: {
                gte: startTime,
                lt: endTime,
              },
            },
            {
              endTime: {
                gt: startTime,
                lte: endTime,
              },
            },
            {
              AND: [{ startTime: { lte: startTime } }, { endTime: { gte: endTime } }],
            },
          ],
        },
      });

      if (conflictingBooking) {
        return {
          isAvailable: false,
          reason: "Time slot conflicts with an existing booking",
        };
      }

      return { isAvailable: true };
    } catch (error) {
      this.log.error("Error checking slot availability", { error, eventTypeId, startTime, endTime });
      return {
        isAvailable: false,
        reason: "Unable to verify slot availability",
      };
    }
  }

  /**
   * Perform the actual reschedule using existing Cal.com logic
   * This would integrate with the existing reschedule service
   */
  private async performReschedule(
    booking: any,
    options: {
      newStartTime: Date;
      newEndTime: Date;
      timeZone: string;
      reason?: string;
      userRole: "host" | "attendee" | "unauthorized";
    }
  ): Promise<{ success: boolean; message?: string; bookingUid?: string; newBookingId?: number }> {
    console.log("🚀 Appointly Reschedule: Starting reschedule process", {
      bookingId: booking.id,
      newStartTime: options.newStartTime,
      newEndTime: options.newEndTime,
      userRole: options.userRole,
    });

    try {
      // Get the booking with all necessary relations
      const bookingWithRelations = await prisma.booking.findUnique({
        where: { id: booking.id },
        include: {
          attendees: true,
          user: true,
          eventType: true,
          references: true,
        },
      });

      if (!bookingWithRelations) {
        throw new Error("Booking not found");
      }

      if (!bookingWithRelations.user) {
        throw new Error("Booking user not found");
      }

      // Get user credentials first
      const userCredentials = await prisma.credential.findMany({
        where: { userId: bookingWithRelations.user.id },
        select: {
          id: true,
          type: true,
          key: true,
          userId: true,
          teamId: true,
          appId: true,
          invalid: true,
          delegationCredentialId: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      });

      // Get all credentials for the organizer
      const allCredentials = await getAllCredentialsIncludeServiceAccountKey(
        {
          id: bookingWithRelations.user.id,
          username: bookingWithRelations.user.username,
          email: bookingWithRelations.user.email,
          credentials: userCredentials,
        },
        null // Pass null to avoid type issues, credentials will still be fetched
      );

      // Get user's destination calendar
      const userDestinationCalendar = await prisma.destinationCalendar.findFirst({
        where: { userId: bookingWithRelations.user.id },
      });

      // Parse event type metadata
      const eventTypeMetadata = bookingWithRelations.eventType?.metadata
        ? (bookingWithRelations.eventType.metadata as any)?.apps || {}
        : {};

      // Create EventManager for proper calendar integration
      const eventManager = new EventManager(
        {
          credentials: allCredentials,
          destinationCalendar: userDestinationCalendar,
        },
        eventTypeMetadata
      );

      // Build calendar event using Cal.com's standard approach
      const builder = new CalendarEventBuilder();
      const director = new CalendarEventDirector();

      // Get translations for organizer and attendees
      const organizerT = await getTranslation(bookingWithRelations.user?.locale ?? "en", "common");

      const attendeePromises = bookingWithRelations.attendees.map(async (attendee) => {
        const tAttendee = await getTranslation(attendee.locale ?? "en", "common");
        return {
          email: attendee.email,
          name: attendee.name,
          timeZone: attendee.timeZone,
          language: { translate: tAttendee, locale: attendee.locale ?? "en" },
          phoneNumber: attendee.phoneNumber || undefined,
        };
      });

      const attendeeList = await Promise.all(attendeePromises);

      // Initialize the calendar event builder with proper timezone formatting
      builder.init({
        title: bookingWithRelations.title || "Meeting",
        type: bookingWithRelations.eventType?.title || "Meeting",
        startTime: dayjs(options.newStartTime)
          .tz(bookingWithRelations.user?.timeZone || "UTC")
          .format(),
        endTime: dayjs(options.newEndTime)
          .tz(bookingWithRelations.user?.timeZone || "UTC")
          .format(),
        attendees: attendeeList,
        organizer: {
          name: bookingWithRelations.user?.name || "Organizer",
          email: bookingWithRelations.user?.email || "",
          timeZone: bookingWithRelations.user?.timeZone || "UTC",
          language: { translate: organizerT, locale: bookingWithRelations.user?.locale ?? "en" },
        },
        hideOrganizerEmail: bookingWithRelations.eventType?.hideOrganizerEmail,
        location: bookingWithRelations.location || "",
        description: bookingWithRelations.description || "",
        uid: bookingWithRelations.uid,
      });

      // Set up the director for reschedule
      director.setBuilder(builder);
      director.setExistingBooking(bookingWithRelations);
      if (options.reason) {
        director.setCancellationReason(options.reason);
      }

      // Build the calendar event
      await director.buildForRescheduleEmail();

      // Add video call data from existing references
      let calendarEvent = addVideoCallDataToEvent(bookingWithRelations.references, builder.calendarEvent);
      calendarEvent.rescheduledBy =
        options.userRole === "host"
          ? bookingWithRelations.user?.email
          : bookingWithRelations.attendees[0]?.email;

      // Process location to get actual meeting URL if it's an integration
      if (calendarEvent.location?.includes("integrations:")) {
        // If we have video call data, use the actual meeting URL
        if (calendarEvent.videoCallData?.url) {
          calendarEvent.location = calendarEvent.videoCallData.url;
        }
        // If we have meetingUrl in references, use that
        else {
          const videoReference = bookingWithRelations.references.find((ref) => ref.type.includes("_video"));
          if (videoReference?.meetingUrl) {
            calendarEvent.location = videoReference.meetingUrl;
          }
        }
      }

      // Log calendar event details for debugging
      this.log.info("Calendar event details", {
        bookingId: booking.id,
        startTime: calendarEvent.startTime,
        endTime: calendarEvent.endTime,
        organizer: calendarEvent.organizer.email,
        attendees: calendarEvent.attendees.map((a) => a.email),
        videoCallData: calendarEvent.videoCallData,
        location: calendarEvent.location,
        originalLocation: bookingWithRelations.location,
      });

      // Ensure we have the proper iCalUID for updating existing calendar events
      if (bookingWithRelations.iCalUID) {
        calendarEvent.iCalUID = bookingWithRelations.iCalUID;
      }

      // Use EventManager to handle the reschedule with proper calendar integration
      console.log("🔄 Calling EventManager.reschedule...");
      let updateManager;
      try {
        updateManager = await eventManager.reschedule(
          calendarEvent,
          bookingWithRelations.uid,
          undefined, // newBookingId
          false, // changedOrganizer
          undefined, // previousHostDestinationCalendar
          false // isBookingRequestedReschedule
        );
        console.log("✅ EventManager.reschedule completed successfully");
      } catch (eventManagerError) {
        console.error("❌ EventManager.reschedule failed:", eventManagerError);
        this.log.error("EventManager.reschedule failed", {
          bookingId: booking.id,
          error: eventManagerError,
        });
        throw eventManagerError;
      }

      // Update calendar event with actual meeting URLs from results
      const videoResult = updateManager.results.find(
        (r) => r.type.includes("_video") || r.createdEvent?.url || r.updatedEvent?.url
      );

      // Check if we got a created event (new) or updated event (existing)
      if (videoResult?.createdEvent?.url) {
        console.log("🆕 Created new video event:", videoResult.createdEvent.url);
        calendarEvent.location = videoResult.createdEvent.url;
        calendarEvent.videoCallData = {
          type: videoResult.type,
          id: videoResult.createdEvent.id,
          password: videoResult.createdEvent.password,
          url: videoResult.createdEvent.url,
        };
      } else if (videoResult?.updatedEvent?.url) {
        console.log("🔄 Updated existing video event:", videoResult.updatedEvent.url);
        calendarEvent.location = videoResult.updatedEvent.url;
        calendarEvent.videoCallData = {
          type: videoResult.type,
          id: videoResult.updatedEvent.id,
          password: videoResult.updatedEvent.password,
          url: videoResult.updatedEvent.url,
        };
      }

      // Check calendar results
      const calendarResults = updateManager.results.filter((r) => r.type.includes("_calendar"));
      console.log(
        "📅 Calendar results:",
        calendarResults.map((r) => ({
          type: r.type,
          success: r.success,
          created: !!r.createdEvent,
          updated: !!r.updatedEvent,
        }))
      );

      // Log calendar integration results
      this.log.info("Calendar integration results", {
        bookingId: booking.id,
        resultsCount: updateManager.results.length,
        referencesToCreate: updateManager.referencesToCreate.length,
        iCalUID: calendarEvent.iCalUID,
        originalReferences: bookingWithRelations.references.map((r) => ({
          type: r.type,
          uid: r.uid,
          meetingUrl: r.meetingUrl,
        })),
        results: updateManager.results.map((r) => ({
          type: r.type,
          success: r.success,
          uid: r.uid,
          createdEvent: r.createdEvent
            ? {
                id: r.createdEvent.id,
                hangoutLink: r.createdEvent.hangoutLink,
                meetingUrl: r.createdEvent.meetingUrl,
                url: r.createdEvent.url,
              }
            : null,
          updatedEvent: r.updatedEvent
            ? {
                id: r.updatedEvent.id,
                hangoutLink: r.updatedEvent.hangoutLink,
                meetingUrl: r.updatedEvent.meetingUrl,
                url: r.updatedEvent.url,
              }
            : null,
        })),
        updatedLocation: calendarEvent.location,
        updatedVideoCallData: calendarEvent.videoCallData,
      });

      // Update the booking in the database
      console.log("🔄 Updating booking in database...");
      const updatedBooking = await prisma.booking.update({
        where: { id: booking.id },
        data: {
          startTime: options.newStartTime,
          endTime: options.newEndTime,
          rescheduled: true,
          rescheduledBy:
            options.userRole === "host"
              ? bookingWithRelations.user?.email
              : bookingWithRelations.attendees[0]?.email,
        },
      });
      console.log("✅ Booking updated successfully");

      // Update booking references with new calendar/video data
      console.log("🔄 Updating booking references...");
      if (updateManager.referencesToCreate.length > 0) {
        console.log("📝 Deleting old references...");
        // Delete old references
        await prisma.bookingReference.deleteMany({
          where: { bookingId: booking.id },
        });

        console.log("📝 Creating new references:", updateManager.referencesToCreate.length);
        // Create new references
        await prisma.bookingReference.createMany({
          data: updateManager.referencesToCreate.map((ref) => ({
            bookingId: booking.id,
            type: ref.type,
            uid: ref.uid,
            meetingId: ref.meetingId,
            meetingPassword: ref.meetingPassword,
            meetingUrl: ref.meetingUrl,
            externalCalendarId: ref.externalCalendarId,
            credentialId: ref.credentialId,
          })),
        });
        console.log("✅ Booking references updated successfully");
      } else {
        console.log("ℹ️ No new references to create");
      }

      // Update appointly-specific fields
      console.log("🔄 Updating appointly fields...");
      const originalBookingDate =
        (bookingWithRelations as any).appointlyOriginalBookingDate || bookingWithRelations.startTime;
      const currentRescheduleCount = (bookingWithRelations as any).appointlyRescheduleCount || 0;

      await this.updateAppointlyFields(booking.id, {
        newStartTime: options.newStartTime,
        originalBookingDate: originalBookingDate,
        rescheduleCount: currentRescheduleCount + 1,
        reason: options.reason,
      });
      console.log("✅ Appointly fields updated successfully");

      // Send reschedule emails
      try {
        // Use the calendar event that was already processed by EventManager
        // This ensures we have the correct video call data and location
        let emailCalendarEvent = {
          ...calendarEvent,
          // Ensure proper timezone formatting for email
          startTime: dayjs(options.newStartTime)
            .tz(bookingWithRelations.user?.timeZone || "UTC")
            .format(),
          endTime: dayjs(options.newEndTime)
            .tz(bookingWithRelations.user?.timeZone || "UTC")
            .format(),
          // Include event type for proper email formatting
          eventType: bookingWithRelations.eventType,
        };

        // Extract video call data from EventManager results
        const videoResult = updateManager.results.find(
          (r) =>
            r.type.includes("_video") ||
            r.createdEvent?.url ||
            r.updatedEvent?.url ||
            r.createdEvent?.hangoutLink ||
            r.updatedEvent?.hangoutLink
        );

        if (videoResult) {
          console.log("🎥 Found video result:", {
            type: videoResult.type,
            createdEvent: videoResult.createdEvent
              ? {
                  url: videoResult.createdEvent.url,
                  hangoutLink: videoResult.createdEvent.hangoutLink,
                  meetingUrl: videoResult.createdEvent.meetingUrl,
                }
              : null,
            updatedEvent: videoResult.updatedEvent
              ? {
                  url: videoResult.updatedEvent.url,
                  hangoutLink: videoResult.updatedEvent.hangoutLink,
                  meetingUrl: videoResult.updatedEvent.meetingUrl,
                }
              : null,
          });

          // Use the actual meeting URL from the results
          const meetingUrl =
            videoResult.createdEvent?.url ||
            videoResult.updatedEvent?.url ||
            videoResult.createdEvent?.hangoutLink ||
            videoResult.updatedEvent?.hangoutLink ||
            videoResult.createdEvent?.meetingUrl ||
            videoResult.updatedEvent?.meetingUrl;

          if (meetingUrl) {
            emailCalendarEvent.location = meetingUrl;
            emailCalendarEvent.videoCallData = {
              type: videoResult.type,
              id: videoResult.createdEvent?.id || videoResult.updatedEvent?.id,
              password: videoResult.createdEvent?.password || videoResult.updatedEvent?.password,
              url: meetingUrl,
            };
            console.log("✅ Set video call data for email:", {
              location: emailCalendarEvent.location,
              videoCallData: emailCalendarEvent.videoCallData,
            });
          }
        }

        // Fallback: Ensure video call data is properly set for email
        if (!emailCalendarEvent.videoCallData && calendarEvent.videoCallData) {
          emailCalendarEvent.videoCallData = calendarEvent.videoCallData;
        }

        // Fallback: Ensure location has the actual meeting URL
        if (
          emailCalendarEvent.location === "integrations:google:meet" &&
          calendarEvent.location !== "integrations:google:meet"
        ) {
          emailCalendarEvent.location = calendarEvent.location;
        }

        // Log email calendar event details for debugging
        console.log("📧 Email Calendar Event Details:", {
          bookingId: booking.id,
          location: emailCalendarEvent.location,
          videoCallData: emailCalendarEvent.videoCallData,
          startTime: emailCalendarEvent.startTime,
          endTime: emailCalendarEvent.endTime,
          updateManagerResults: updateManager.results.map((r) => ({
            type: r.type,
            success: r.success,
            createdEvent: r.createdEvent
              ? {
                  url: r.createdEvent.url,
                  hangoutLink: r.createdEvent.hangoutLink,
                  meetingUrl: r.createdEvent.meetingUrl,
                }
              : null,
            updatedEvent: r.updatedEvent
              ? {
                  url: r.updatedEvent.url,
                  hangoutLink: r.updatedEvent.hangoutLink,
                  meetingUrl: r.updatedEvent.meetingUrl,
                }
              : null,
          })),
        });

        await sendRescheduledEmailsAndSMS(emailCalendarEvent);
        this.log.info("Reschedule emails sent successfully", { bookingId: booking.id });
      } catch (emailError) {
        this.log.error("Failed to send reschedule emails", {
          bookingId: booking.id,
          error: emailError,
        });
        // Don't fail the reschedule if emails fail
      }

      this.log.info("Booking rescheduled successfully with calendar integration", {
        bookingId: booking.id,
        newStartTime: options.newStartTime,
        newEndTime: options.newEndTime,
        results: updateManager.results.length,
      });

      console.log("✅ Appointly Reschedule: Completed successfully", {
        bookingId: booking.id,
        bookingUid: updatedBooking.uid,
        newBookingId: updatedBooking.id,
      });

      return {
        success: true,
        bookingUid: updatedBooking.uid,
        newBookingId: updatedBooking.id,
      };
    } catch (error: any) {
      this.log.error("Failed to perform reschedule", {
        bookingId: booking.id,
        error: error?.message || error,
      });

      return {
        success: false,
        message: "Failed to update booking",
      };
    }
  }

  /**
   * Update appointly-specific fields after successful reschedule
   */
  private async updateAppointlyFields(
    bookingId: number,
    updates: {
      newStartTime: Date;
      originalBookingDate: Date;
      rescheduleCount: number;
      reason?: string;
    }
  ): Promise<void> {
    try {
      await (prisma as any).booking.update({
        where: { id: bookingId },
        data: {
          appointlyRescheduleCount: updates.rescheduleCount,
          appointlyOriginalBookingDate: updates.originalBookingDate,
          // Store reschedule reason if provided
          ...(updates.reason && { description: updates.reason }),
        },
      });

      this.log.info("Updated appointly fields", {
        bookingId,
        rescheduleCount: updates.rescheduleCount,
        originalBookingDate: updates.originalBookingDate,
      });
    } catch (error: any) {
      this.log.error("Failed to update appointly fields", {
        bookingId,
        error: error?.message || error,
      });
      // Don't throw here as the main reschedule was successful
    }
  }

  /**
   * Get reschedule information for a booking
   */
  async getRescheduleInfo(bookingId: number): Promise<{
    canReschedule: boolean;
    reason?: string;
    rescheduleCount: number;
    maxReschedules: number;
    originalBookingDate?: Date;
    timeUntilAppointment?: number; // hours
  }> {
    try {
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });

      const bookingWithAppointlyFields = booking as any;
      const eligibilityCheck = canRescheduleBooking(booking);
      const now = new Date();
      const originalStartTime = bookingWithAppointlyFields.appointlyOriginalBookingDate || booking.startTime;
      const timeUntilAppointment = (originalStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      return {
        canReschedule: eligibilityCheck.canReschedule,
        reason: eligibilityCheck.reason,
        rescheduleCount: bookingWithAppointlyFields.appointlyRescheduleCount || 0,
        maxReschedules: -1, // -1 indicates unlimited reschedules
        originalBookingDate: bookingWithAppointlyFields.appointlyOriginalBookingDate || undefined,
        timeUntilAppointment: Math.max(0, timeUntilAppointment),
      };
    } catch (error: any) {
      this.log.error("Failed to get reschedule info", {
        bookingId,
        error: error?.message || error,
      });

      return {
        canReschedule: false,
        reason: "Unable to retrieve booking information",
        rescheduleCount: 0,
        maxReschedules: -1, // -1 indicates unlimited reschedules
      };
    }
  }
}

// Export singleton instance
export const appointlyRescheduleHandler = new AppointlyRescheduleHandler();
