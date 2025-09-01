import { OrganizerScheduledEmail } from "./OrganizerScheduledEmail";

export const OrganizerRescheduledEmail = (props: React.ComponentProps<typeof OrganizerScheduledEmail>) => {
  const timeZone = process.env.EMAIL_TIMEZONE_OVERRIDE || props.attendee.timeZone;
  return (
    <OrganizerScheduledEmail
      title="event_has_been_rescheduled"
      headerType="calendarCircle"
      timeZone={timeZone}
      subject="event_type_has_been_rescheduled_on_time_date"
      {...props}
    />
  );
};
