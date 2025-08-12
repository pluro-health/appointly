import { useRouter } from "next/navigation";
import React from "react";

import dayjs from "@calcom/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { formatPrice } from "@calcom/lib/price";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";

interface PaymentStatusProps {
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED";
  bookingData: {
    uid: string;
    startTime: string;
    endTime: string;
    title: string;
  };
  paymentData?: {
    amount: number;
    currency: string;
    transactionId?: string;
    paymentMethod?: string;
    paidAt?: string;
  };
  errorMessage?: string;
  onRetry?: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

export const PaymentStatus: React.FC<PaymentStatusProps> = ({
  status,
  bookingData,
  paymentData,
  errorMessage,
  onRetry,
  onCancel,
  isLoading = false,
}) => {
  const { t } = useLocale();
  const router = useRouter();

  const formattedDate = dayjs(bookingData.startTime).format("dddd, MMMM D, YYYY");
  const formattedTime = dayjs(bookingData.startTime).format("h:mm A");
  const formattedPrice = paymentData ? formatPrice(paymentData.amount, paymentData.currency) : "";

  const getStatusConfig = () => {
    switch (status) {
      case "PENDING":
        return {
          icon: "clock",
          iconColor: "text-yellow-600",
          bgColor: "bg-yellow-50",
          title: t("payment_pending"),
          description: t("payment_pending_description"),
          showRetry: false,
          showCancel: true,
        };
      case "PROCESSING":
        return {
          icon: "loader",
          iconColor: "text-blue-600",
          bgColor: "bg-blue-50",
          title: t("payment_processing"),
          description: t("payment_processing_description"),
          showRetry: false,
          showCancel: false,
        };
      case "SUCCESS":
        return {
          icon: "check-circle",
          iconColor: "text-green-600",
          bgColor: "bg-green-50",
          title: t("payment_successful"),
          description: t("payment_successful_description"),
          showRetry: false,
          showCancel: false,
        };
      case "FAILED":
        return {
          icon: "x-circle",
          iconColor: "text-red-600",
          bgColor: "bg-red-50",
          title: t("payment_failed"),
          description: errorMessage || t("payment_failed_description"),
          showRetry: true,
          showCancel: true,
        };
      case "CANCELLED":
        return {
          icon: "x",
          iconColor: "text-gray-600",
          bgColor: "bg-gray-50",
          title: t("payment_cancelled"),
          description: t("payment_cancelled_description"),
          showRetry: true,
          showCancel: false,
        };
      default:
        return {
          icon: "help-circle",
          iconColor: "text-gray-600",
          bgColor: "bg-gray-50",
          title: t("payment_unknown"),
          description: t("payment_unknown_description"),
          showRetry: false,
          showCancel: true,
        };
    }
  };

  const config = getStatusConfig();

  const handleViewBooking = () => {
    router.push(`/booking/${bookingData.uid}`);
  };

  const handleGoHome = () => {
    router.push("/");
  };

  return (
    <div className="bg-default border-subtle rounded-lg border p-6 shadow-sm">
      {/* Status Header */}
      <div className={`mb-6 rounded-lg ${config.bgColor} p-4 text-center`}>
        <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white`}>
          <Icon name={config.icon as any} className={`h-8 w-8 ${config.iconColor}`} />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{config.title}</h2>
        <p className="text-muted mt-2 text-sm">{config.description}</p>
      </div>

      {/* Booking Details */}
      <div className="mb-6 rounded-lg bg-gray-50 p-4">
        <h3 className="mb-3 font-medium text-gray-900">{t("booking_details")}</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">{t("consultation")}</span>
            <span className="text-sm font-medium">{bookingData.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">{t("date")}</span>
            <span className="text-sm font-medium">{formattedDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">{t("time")}</span>
            <span className="text-sm font-medium">{formattedTime}</span>
          </div>
          {paymentData && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">{t("amount")}</span>
              <span className="text-sm font-medium">{formattedPrice}</span>
            </div>
          )}
        </div>
      </div>

      {/* Payment Details (for successful payments) */}
      {status === "SUCCESS" && paymentData && (
        <div className="mb-6 rounded-lg bg-green-50 p-4">
          <h3 className="mb-3 font-medium text-gray-900">{t("payment_details")}</h3>
          <div className="space-y-2">
            {paymentData.transactionId && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">{t("transaction_id")}</span>
                <span className="font-mono text-sm font-medium">{paymentData.transactionId}</span>
              </div>
            )}
            {paymentData.paymentMethod && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">{t("payment_method")}</span>
                <span className="text-sm font-medium">{paymentData.paymentMethod}</span>
              </div>
            )}
            {paymentData.paidAt && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">{t("paid_at")}</span>
                <span className="text-sm font-medium">
                  {dayjs(paymentData.paidAt).format("MMM D, YYYY h:mm A")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Details (for failed payments) */}
      {status === "FAILED" && errorMessage && (
        <div className="mb-6 rounded-lg bg-red-50 p-4">
          <h3 className="mb-3 font-medium text-red-900">{t("error_details")}</h3>
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-3">
        {config.showRetry && onRetry && (
          <Button type="button" color="primary" onClick={onRetry} loading={isLoading} className="flex-1">
            {t("retry_payment")}
          </Button>
        )}

        {config.showCancel && onCancel && (
          <Button type="button" color="minimal" onClick={onCancel} disabled={isLoading} className="flex-1">
            {t("cancel_booking")}
          </Button>
        )}

        {status === "SUCCESS" && (
          <Button type="button" color="primary" onClick={handleViewBooking} className="flex-1">
            {t("view_booking")}
          </Button>
        )}

        {status === "FAILED" || status === "CANCELLED" ? (
          <Button type="button" color="minimal" onClick={handleGoHome} className="flex-1">
            {t("go_home")}
          </Button>
        ) : null}
      </div>

      {/* Additional Info */}
      {status === "PROCESSING" && (
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">{t("please_wait_payment_processing")}</p>
        </div>
      )}

      {status === "SUCCESS" && (
        <div className="mt-4 text-center">
          <p className="text-sm text-green-600">{t("confirmation_email_sent")}</p>
        </div>
      )}
    </div>
  );
};
