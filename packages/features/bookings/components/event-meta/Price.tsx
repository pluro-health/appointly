import dynamic from "next/dynamic";

import { formatPrice } from "@calcom/lib/price";

import type { EventPrice } from "../../types";

const AlbyPriceComponent = dynamic(
  () => import("@calcom/app-store/alby/components/AlbyPriceComponent").then((m) => m.AlbyPriceComponent),
  {
    ssr: false,
  }
);

export const Price = ({ price, currency, displayAlternateSymbol = true }: EventPrice) => {
  if (price === 0) return null;

  const formattedPrice = formatPrice(price, currency);

  return currency !== "BTC" ? (
    <>{formattedPrice}</>
  ) : (
    <AlbyPriceComponent
      displaySymbol={displayAlternateSymbol}
      price={price}
      formattedPrice={formattedPrice}
    />
  );
};

export const AppointlyPrice = ({ price, currency, displayAlternateSymbol = true }: EventPrice) => {
  if (price === 0) return null;
  const formattedPrice =
    currency !== "BTC"
      ? Intl.NumberFormat("en", {
          style: "currency",
          currency: currency?.toUpperCase() || "USD",
        }).format(price)
      : formatPrice(price, currency);
  console.log("price", formattedPrice);

  return currency !== "BTC" ? (
    <>{formattedPrice}</>
  ) : (
    <AlbyPriceComponent
      displaySymbol={displayAlternateSymbol}
      price={price}
      formattedPrice={formattedPrice}
    />
  );
};
