import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { useFormContext } from "react-hook-form";

import dayjs from "@calcom/dayjs";
import { getEventName } from "@calcom/lib/event";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { formatPrice } from "@calcom/lib/price";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";

import type { BookingFormValues } from "../../types";

interface PaymentConfirmationProps {
  eventType: {
    title: string;
    consultationPrice: number;
    paymentCurrency: string;
    description?: string | null;
  };
  bookingData: {
    startTime: string;
    endTime: string;
    duration: number;
  };
  center?: {
    name: string;
    address?: string;
  } | null;
  doctor?: {
    name: string;
    email: string;
  } | null;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const PaymentConfirmation: React.FC<PaymentConfirmationProps> = ({
  eventType,
  bookingData,
  center,
  doctor,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const { t } = useLocale();
  const router = useRouter();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

  const bookingForm = useFormContext<BookingFormValues>();
  const attendeeName = bookingForm.watch("responses.name");
  const attendeeEmail = bookingForm.watch("responses.email");

  const eventName = getEventName({
    attendeeName: attendeeName as string,
    eventType: eventType.title,
    eventName: eventType.title,
    host: doctor?.name || "Doctor",
    location: center?.name || "Medical Center",
    bookingFields: bookingForm.getValues("responses"),
    eventDuration: bookingData.duration,
    t,
  });

  const formattedPrice = formatPrice(eventType.consultationPrice, eventType.paymentCurrency);
  const formattedDate = dayjs(bookingData.startTime).format("dddd, MMMM D, YYYY");
  const formattedTime = dayjs(bookingData.startTime).format("h:mm A");

  const handleConfirm = () => {
    if (acceptedTerms && acceptedPrivacy) {
      onConfirm();
    }
  };

  return (
    <div className="bg-default border-subtle rounded-lg border p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <Icon name="credit-card" className="h-6 w-6 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{t("payment_confirmation")}</h2>
        <p className="text-muted mt-2 text-sm">{t("review_payment_details")}</p>
      </div>

      {/* Payment Summary */}
      <div className="mb-6 rounded-lg bg-gray-50 p-4">
        <h3 className="mb-3 font-medium text-gray-900">{t("consultation_details")}</h3>

        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">{t("consultation_type")}</span>
            <span className="text-sm font-medium">{eventName}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-sm text-gray-600">{t("date")}</span>
            <span className="text-sm font-medium">{formattedDate}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-sm text-gray-600">{t("time")}</span>
            <span className="text-sm font-medium">{formattedTime}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-sm text-gray-600">{t("duration")}</span>
            <span className="text-sm font-medium">
              {bookingData.duration} {t("minutes")}
            </span>
          </div>

          {center && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">{t("center")}</span>
              <span className="text-sm font-medium">{center.name}</span>
            </div>
          )}

          {doctor && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">{t("doctor")}</span>
              <span className="text-sm font-medium">{doctor.name}</span>
            </div>
          )}

          <div className="border-t pt-3">
            <div className="flex justify-between">
              <span className="text-base font-semibold text-gray-900">{t("total_amount")}</span>
              <span className="text-lg font-bold text-green-600">{formattedPrice}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Attendee Information */}
      <div className="mb-6 rounded-lg bg-blue-50 p-4">
        <h3 className="mb-3 font-medium text-gray-900">{t("attendee_information")}</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">{t("name")}</span>
            <span className="text-sm font-medium">{attendeeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">{t("email")}</span>
            <span className="text-sm font-medium">{attendeeEmail}</span>
          </div>
        </div>
      </div>

      {/* Secure Payment Indicators */}
      <div className="mb-6 flex items-center justify-center space-x-4 rounded-lg bg-green-50 p-4">
        <div className="flex items-center space-x-2">
          <Icon name="shield-check" className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium text-green-800">{t("secure_payment")}</span>
        </div>
        <div className="flex items-center space-x-2">
          <Icon name="lock" className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-700">{t("ssl_encrypted")}</span>
        </div>
        <div className="flex items-center space-x-2">
          <Icon name="credit-card" className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-700">{t("multiple_payment_methods")}</span>
        </div>
      </div>

      {/* Terms and Conditions */}
      <div className="mb-6 space-y-3">
        <div className="flex items-start space-x-3">
          <input
            type="checkbox"
            id="terms"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="terms" className="text-sm text-gray-700">
            {t("i_agree_to")}{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline">
              {t("terms_and_conditions")}
            </a>
          </label>
        </div>

        <div className="flex items-start space-x-3">
          <input
            type="checkbox"
            id="privacy"
            checked={acceptedPrivacy}
            onChange={(e) => setAcceptedPrivacy(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="privacy" className="text-sm text-gray-700">
            {t("i_agree_to")}{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline">
              {t("privacy_policy")}
            </a>
          </label>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        <Button type="button" color="minimal" onClick={onCancel} disabled={isLoading} className="flex-1">
          {t("cancel")}
        </Button>
        <Button
          type="button"
          color="primary"
          onClick={handleConfirm}
          disabled={!acceptedTerms || !acceptedPrivacy || isLoading}
          loading={isLoading}
          className="flex-1">
          {t("proceed_to_payment")}
        </Button>
      </div>

      {/* Payment Methods Info */}
      <div className="mt-4 text-center">
        <p className="text-xs text-gray-500">
          {t("payment_methods_include")}: UPI, Credit/Debit Cards, Net Banking, Wallets
        </p>
      </div>
    </div>
  );
};
