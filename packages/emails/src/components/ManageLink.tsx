import { getBookingUrl, getCancelLink, getRescheduleLink } from "@calcom/lib/CalEventParser";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";

export function ManageLink(props: { calEvent: CalendarEvent; attendee: Person }) {
  // Only the original attendee can make changes to the event
  // Guests cannot
  const t = props.attendee.language.translate;
  const cancelLink = getCancelLink(props.calEvent, props.attendee);
  const rescheduleLink = getRescheduleLink({ calEvent: props.calEvent, attendee: props.attendee });
  const bookingLink = getBookingUrl(props.calEvent);

  const isOriginalAttendee = props.attendee.email === props.calEvent.attendees[0]?.email;
  const isOrganizer = props.calEvent.organizer.email === props.attendee.email;
  const hasCancelLink = Boolean(cancelLink) && !props.calEvent.disableCancelling;
  const hasRescheduleLink = Boolean(rescheduleLink) && !props.calEvent.disableRescheduling;
  const hasBookingLink = Boolean(bookingLink);
  const isRecurringEvent = props.calEvent.recurringEvent;
  const shouldDisplayRescheduleLink = Boolean(hasRescheduleLink && !isRecurringEvent);
  const isTeamMember = props.calEvent.team?.members.some((member) => props.attendee.email === member.email);

  if (
    (isOriginalAttendee || isOrganizer || isTeamMember) &&
    (hasCancelLink || (!isRecurringEvent && hasRescheduleLink) || hasBookingLink)
  ) {
    return (
      <div
        style={{
          fontFamily: "Roboto, Helvetica, sans-serif",
          fontSize: "16px",
          fontWeight: 500,
          lineHeight: "0px",
          textAlign: "left",
          color: "#101010",
        }}>
        <p
          style={{
            fontWeight: 400,
            lineHeight: "24px",
            textAlign: "center",
            width: "100%",
          }}>
          {(shouldDisplayRescheduleLink || hasCancelLink) && <>{t("need_to_make_a_change")}</>}
          {shouldDisplayRescheduleLink && (
            <span>
              <a
                href={rescheduleLink}
                style={{
                  color: "#374151",
                  marginLeft: "5px",
                  marginRight: "5px",
                  textDecoration: "underline",
                }}>
                <>{t("reschedule")}</>
              </a>
              {hasCancelLink && <>{t("or_lowercase")}</>}
            </span>
          )}
          {hasCancelLink && (
            <span>
              <a
                href={cancelLink}
                style={{
                  color: "#374151",
                  marginLeft: "5px",
                  textDecoration: "underline",
                }}>
                <>{t("cancel")}</>
              </a>
            </span>
          )}

          {props.calEvent.platformClientId && hasBookingLink && (
            <span>
              {(hasCancelLink || shouldDisplayRescheduleLink) && (
                <span
                  style={{
                    marginLeft: "5px",
                  }}>
                  {t("or_lowercase")}
                </span>
              )}
              <a
                href={bookingLink}
                style={{
                  color: "#374151",
                  marginLeft: "5px",
                  textDecoration: "underline",
                }}>
                <>{t("check_here")}</>
              </a>
            </span>
          )}
        </p>

        {hasCancelLink && (
          <div
            style={{
              marginTop: "20px",
              padding: "16px",
              backgroundColor: "#f9fafb",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
            }}>
            <p
              style={{
                fontWeight: 500,
                fontSize: "14px",
                lineHeight: "20px",
                color: "#374151",
                margin: "0 0 8px 0",
              }}>
              <>{t("cancellation_policy")}</>
            </p>
            <p
              style={{
                fontSize: "13px",
                lineHeight: "18px",
                color: "#6b7280",
                margin: "0",
              }}>
              <>
                {t("cancellation_policy_description", {
                  hours: "24",
                })}
              </>
            </p>
            <p
              style={{
                fontSize: "13px",
                lineHeight: "18px",
                color: "#6b7280",
                margin: "8px 0 0 0",
              }}>
              <a
                href={cancelLink}
                style={{
                  color: "#2563eb",
                  textDecoration: "underline",
                }}>
                <>{t("manage_your_booking")}</>
              </a>
            </p>
          </div>
        )}
      </div>
    );
  }

  // Don't have the rights to the manage link
  return null;
}
