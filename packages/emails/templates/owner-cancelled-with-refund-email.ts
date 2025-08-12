import { getReplyToHeader } from "@calcom/lib/getReplyToHeader";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";

import { renderEmail } from "../";
import generateIcsFile, { GenerateIcsRole } from "../lib/generateIcsFile";
import AttendeeScheduledEmail from "./attendee-scheduled-email";

export default class OwnerCancelledWithRefundEmail extends AttendeeScheduledEmail {
  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    return {
      icalEvent: generateIcsFile({
        calEvent: this.calEvent,
        role: GenerateIcsRole.ATTENDEE,
        status: "CANCELLED",
      }),
      to: `${this.attendee.name} <${this.attendee.email}>`,
      from: `${this.calEvent.organizer.name} <${this.getMailerOptions().from}>`,
      ...getReplyToHeader(this.calEvent),
      subject: `${this.t("event_cancelled_refund_subject", {
        title: this.calEvent.title,
        date: this.getFormattedDate(),
      })}`,
      html: await this.getHtml(this.calEvent, this.attendee),
      text: this.getTextBody("event_cancelled_by_owner_with_refund", "full_refund_processing_message"),
    };
  }

  async getHtml(calEvent: CalendarEvent, attendee: Person) {
    return await renderEmail("OwnerCancelledWithRefundEmail", {
      calEvent: {
        ...calEvent,
        cancellationReason: calEvent.cancellationReason || "Event cancelled by organizer",
      },
      attendee,
    });
  }
}
