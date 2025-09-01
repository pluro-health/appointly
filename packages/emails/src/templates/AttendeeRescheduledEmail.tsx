import { AttendeeScheduledEmail } from "./AttendeeScheduledEmail";

export const AttendeeRescheduledEmail = (props: React.ComponentProps<typeof AttendeeScheduledEmail>) => {
  const timeZone = process.env.EMAIL_TIMEZONE_OVERRIDE || props.timeZone;
  return (
    <AttendeeScheduledEmail
      title="event_has_been_rescheduled"
      headerType="calendarCircle"
      subject="event_type_has_been_rescheduled_on_time_date"
      timeZone={timeZone}
      {...props}
    />
  );
};
