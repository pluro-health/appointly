import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getLocale } from "@calcom/features/auth/lib/getLocale";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { HttpError } from "@calcom/lib/http-error";
import { getTranslation } from "@calcom/lib/server/i18n";
import { prisma } from "@calcom/prisma";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

import { PaymentInitiateWrapper } from "../components/PaymentInitiateWrapper";

interface PageProps {
  searchParams: {
    bookingUid?: string;
    payment?: string;
  };
}

export default async function PaymentInitiatePage({ searchParams }: PageProps) {
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

  if (payment !== "pending") {
    redirect(`/booking/${bookingUid}`);
  }

  try {
    // Get booking with related data
    const booking = await prisma.booking.findUnique({
      where: { uid: bookingUid },
      include: {
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

    // Check if payment is required
    if (!booking.eventType?.requiresPayment || !booking.eventType?.consultationPrice) {
      redirect(`/booking/${bookingUid}`);
    }

    // Check if payment is already initiated
    if (booking.paymentStatus !== "PENDING") {
      redirect(`/booking/${bookingUid}`);
    }

    // ✅ CRITICAL FIX: Auto-redirect to Easebuzz instead of showing intermediate page
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="mx-auto max-w-md px-4">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Redirecting to Payment...</h2>
            <p className="text-gray-600">Please wait while we redirect you to secure payment.</p>
          </div>

          {/* Auto-initiate payment */}
          <script
            // @eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: `
                (async function() {
                  try {
                                         console.log("🚀 Auto-initiating payment for booking: ${booking.uid}");
                     const response = await fetch("/api/payments/initiate", {
                       method: "POST",
                       headers: { "Content-Type": "application/json" },
                       body: JSON.stringify({ bookingUid: "${booking.uid}" })
                    });
                    
                    if (response.ok) {
                      const result = await response.json();
                      if (result.success && result.paymentUrl) {
                        console.log("🌐 Redirecting to Easebuzz:", result.paymentUrl);
                        window.location.href = result.paymentUrl;
                        return;
                      }
                    }
                    
                    console.error("❌ Auto-payment failed, showing manual option");
                    // If auto-redirect fails, show the payment wrapper
                    document.getElementById('auto-redirect').style.display = 'none';
                    document.getElementById('manual-payment').style.display = 'block';
                  } catch (error) {
                    console.error("❌ Auto-redirect error:", error);
                    document.getElementById('auto-redirect').style.display = 'none';
                    document.getElementById('manual-payment').style.display = 'block';
                  }
                })();
              `,
            }}
          />

          {/* Fallback manual payment option (hidden by default) */}
          <div id="manual-payment" style={{ display: "none" }}>
            <PaymentInitiateWrapper
              bookingId={booking.id}
              bookingUid={booking.uid}
              eventType={{
                title: booking.eventType.title || "",
                consultationPrice: Number(booking.eventType.consultationPrice) || 0,
                paymentCurrency: booking.eventType.paymentCurrency || "INR",
                description: booking.eventType.description,
              }}
              bookingData={{
                startTime: booking.startTime.toISOString(),
                endTime: booking.endTime.toISOString(),
                duration: booking.eventType.length || 30,
              }}
              center={
                booking.user?.center
                  ? {
                      name: booking.user.center.name,
                      address: booking.user.center.address || undefined,
                    }
                  : null
              }
              doctor={
                booking.user
                  ? {
                      name: booking.user.name || "",
                      email: booking.user.email || "",
                    }
                  : null
              }
            />
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Payment initiate page error:", error);
    redirect("/");
  }
}
