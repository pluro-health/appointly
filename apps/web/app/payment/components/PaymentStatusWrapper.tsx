interface PaymentStatusWrapperProps {
  bookingId: number;
  bookingUid: string;
  initialStatus: string;
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
  };
}

export function PaymentStatusWrapper({
  bookingId,
  bookingUid,
  initialStatus,
  bookingData,
  paymentData,
}: PaymentStatusWrapperProps) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
      <h2 className="mb-2 text-lg font-semibold text-gray-900">Processing Payment...</h2>
      <p className="text-gray-600">Please wait while we process your payment.</p>
      {paymentData && (
        <div className="mt-4 text-sm text-gray-500">
          Amount: {paymentData.amount} {paymentData.currency}
        </div>
      )}
    </div>
  );
}
