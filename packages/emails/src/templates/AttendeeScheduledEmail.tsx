import type { CalendarEvent, Person } from "@calcom/types/Calendar";

import { BaseScheduledEmail } from "./BaseScheduledEmail";

export const AttendeeScheduledEmail = (
  props: {
    calEvent: CalendarEvent;
    attendee: Person;
  } & Partial<React.ComponentProps<typeof BaseScheduledEmail>>
) => {
  const timeZone = process.env.EMAIL_TIMEZONE_OVERRIDE || props.attendee.timeZone;
  return (
    <BaseScheduledEmail
      locale={props.attendee.language.locale}
      timeZone={timeZone}
      t={props.attendee.language.translate}
      timeFormat={props.attendee?.timeFormat}
      {...props}
    />
  );
};
