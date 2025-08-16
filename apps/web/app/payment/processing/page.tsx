import type { Metadata } from "next";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getLocale } from "@calcom/features/auth/lib/getLocale";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { HttpError } from "@calcom/lib/http-error";
import { getTranslation } from "@calcom/lib/server/i18n";
import { prisma } from "@calcom/prisma";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

import { PaymentStatusWrapper } from "../components/PaymentStatusWrapper";

interface PageProps {
  searchParams: Promise<{
    bookingUid?: string;
    payment?: string;
  }>;
}

export const generateMetadata = async ({ searchParams }: PageProps): Promise<Metadata> => {
  const { bookingUid } = await searchParams;

  return {
    title: "Processing Payment",
    description: `Processing payment for booking ${bookingUid || ""}`,
  };
};

export default async function PaymentProcessingPage({ searchParams }: PageProps) {
  const headersList = await headers();
  const cookiesList = await cookies();
  const req = buildLegacyRequest(headersList, cookiesList);
  const session = await getServerSession({ req });
  const locale = await getLocale(req);
  const t = await getTranslation(locale, "common");

  const { bookingUid, payment } = await searchParams;

  if (!bookingUid) {
    redirect("/");
  }

  if (payment !== "processing") {
    redirect(`/booking/${bookingUid}`);
  }

  try {
    // Get booking with payment details
    const booking = await prisma.booking.findUnique({
      where: { uid: bookingUid },
      include: {
        easebuzzPayment: true,
        eventType: true,
        user: {
          include: {
            center: true,
          },
        },
      },
    });

    if (!booking) {
      throw new HttpError({ statusCode: 404, message: "Booking not found" });
    }

    // Validate access
    if (session?.user?.id && booking.userId !== session.user.id) {
      throw new HttpError({ statusCode: 403, message: "Access denied" });
    }

    // Check if payment is still processing
    if (booking.easebuzzPayment?.status === "SUCCESS") {
      redirect(`/booking/${bookingUid}?payment=success`);
    } else if (booking.easebuzzPayment?.status === "FAILED") {
      redirect(`/booking/${bookingUid}?payment=failed`);
    }

    return (
      <div className="bg-subtle min-h-screen py-12">
        <div className="mx-auto max-w-md px-4">
          <PaymentStatusWrapper
            bookingId={booking.id}
            bookingUid={booking.uid}
            initialStatus="PROCESSING"
            bookingData={{
              uid: booking.uid,
              startTime: booking.startTime.toISOString(),
              endTime: booking.endTime.toISOString(),
              title: booking.title,
            }}
            paymentData={
              booking.easebuzzPayment
                ? {
                    amount: Number(booking.easebuzzPayment.amount),
                    currency: booking.easebuzzPayment.currency,
                    transactionId: booking.easebuzzPayment.easebuzzTxnId || undefined,
                  }
                : undefined
            }
          />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Payment processing page error:", error);
    redirect("/");
  }
}
