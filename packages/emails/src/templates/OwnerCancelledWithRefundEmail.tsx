import { AttendeeScheduledEmail } from "./AttendeeScheduledEmail";

export const OwnerCancelledWithRefundEmail = (props: React.ComponentProps<typeof AttendeeScheduledEmail>) => (
  <AttendeeScheduledEmail
    title="event_cancelled_by_owner"
    headerType="xCircle"
    subject="event_cancelled_refund_subject"
    callToAction={null}
    {...props}
  />
);
