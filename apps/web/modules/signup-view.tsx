"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import type { SubmitHandler } from "react-hook-form";
import { useForm, useFormContext } from "react-hook-form";
import { Toaster } from "sonner";
import { z } from "zod";

import getStripe from "@calcom/app-store/stripepayment/lib/client";
import { getPremiumPlanPriceValue } from "@calcom/app-store/stripepayment/lib/utils";
import { getOrgUsernameFromEmail } from "@calcom/features/auth/signup/utils/getOrgUsernameFromEmail";
import { getOrgFullOrigin } from "@calcom/features/ee/organizations/lib/orgDomains";
import { APP_NAME, URL_PROTOCOL_REGEX, IS_CALCOM, WEBAPP_URL } from "@calcom/lib/constants";
import { fetchUsername } from "@calcom/lib/fetchUsername";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useDebounce } from "@calcom/lib/hooks/useDebounce";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { signupSchema as apiSignupSchema } from "@calcom/prisma/zod-utils";
import type { inferSSRProps } from "@calcom/types/inferSSRProps";
import classNames from "@calcom/ui/classNames";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { PasswordField, TextField, Form } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";

import type { getServerSideProps } from "@lib/signup/getServerSideProps";

const signupSchema = apiSignupSchema.extend({
  apiError: z.string().optional(),
});

type FormValues = z.infer<typeof signupSchema>;

export type SignupProps = inferSSRProps<typeof getServerSideProps>;

function UsernameField({
  username,
  setPremium,
  premium,
  setUsernameTaken,
  orgSlug,
  usernameTaken,
  disabled,
  ...props
}: React.ComponentProps<typeof TextField> & {
  username: string;
  setPremium: (value: boolean) => void;
  premium: boolean;
  usernameTaken: boolean;
  orgSlug?: string;
  setUsernameTaken: (value: boolean) => void;
}) {
  const { t } = useLocale();
  const { register, formState } = useFormContext<FormValues>();
  const debouncedUsername = useDebounce(username, 600);

  useEffect(() => {
    if (formState.isSubmitting || formState.isSubmitSuccessful) return;

    async function checkUsername() {
      // If the username can't be changed, there is no point in doing the username availability check
      if (disabled) return;
      if (!debouncedUsername) {
        setPremium(false);
        setUsernameTaken(false);
        return;
      }
      fetchUsername(debouncedUsername, orgSlug ?? null).then(({ data }) => {
        setPremium(data.premium);
        setUsernameTaken(!data.available);
      });
    }
    checkUsername();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedUsername, disabled, orgSlug, formState.isSubmitting, formState.isSubmitSuccessful]);

  return (
    <div>
      <TextField
        disabled={disabled}
        {...props}
        {...register("username")}
        data-testid="signup-usernamefield"
      />
      {(!formState.isSubmitting || !formState.isSubmitted) && (
        <div className="text-gray text-default flex items-center text-sm">
          <div className="text-sm ">
            {usernameTaken ? (
              <div className="text-error flex items-center">
                <Icon name="info" className="mr-1 inline-block h-4 w-4" />
                <p>{t("already_in_use_error")}</p>
              </div>
            ) : premium ? (
              <div data-testid="premium-username-warning" className="flex items-center">
                <Icon name="star" className="mr-1 inline-block h-4 w-4" />
                <p>
                  {t("premium_username", {
                    price: getPremiumPlanPriceValue(),
                    interpolation: { escapeValue: false },
                  })}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function addOrUpdateQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  const param = `${key}=${encodeURIComponent(value)}`;
  return `${url}${separator}${param}`;
}

export default function Signup({
  prepopulateFormValues,
  token,
  orgSlug,
  isGoogleLoginEnabled,
  orgAutoAcceptEmail,
  redirectUrl,
  emailVerificationEnabled,
}: SignupProps) {
  const isOrgInviteByLink = orgSlug && !prepopulateFormValues?.username;
  const [premiumUsername, setPremiumUsername] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [displayEmailForm, setDisplayEmailForm] = useState(token);
  const searchParams = useCompatSearchParams();
  const { t, i18n } = useLocale();
  const router = useRouter();
  const formMethods = useForm<FormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: prepopulateFormValues satisfies FormValues,
    mode: "onChange",
  });
  const {
    register,
    watch,
    formState: { isSubmitting, errors, isSubmitSuccessful },
  } = formMethods;

  useEffect(() => {
    if (redirectUrl) {
      localStorage.setItem("onBoardingRedirect", redirectUrl);
    }
  }, [redirectUrl]);

  const loadingSubmitState = isSubmitting || isSubmitSuccessful;
  const displayBackButton = token ? false : displayEmailForm;

  const handleErrorsAndStripe = async (resp: Response) => {
    if (!resp.ok) {
      const err = await resp.json();
      if (err.checkoutSessionId) {
        const stripe = await getStripe();
        if (stripe) {
          console.log("Redirecting to stripe checkout");
          const { error } = await stripe.redirectToCheckout({
            sessionId: err.checkoutSessionId,
          });
          console.warn(error.message);
        }
      } else {
        throw new Error(err.message);
      }
    }
  };

  const isPlatformUser = redirectUrl?.includes("platform") && redirectUrl?.includes("new");

  const signUp: SubmitHandler<FormValues> = async (_data) => {
    const data = _data;
    await fetch("/api/auth/signup", {
      body: JSON.stringify({
        ...data,
        language: i18n.language,
        token,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    })
      .then(handleErrorsAndStripe)
      .then(async () => {
        const verifyOrGettingStarted = emailVerificationEnabled ? "auth/verify-email" : "getting-started";
        const gettingStartedWithPlatform = "settings/platform/new";

        const constructCallBackIfUrlPresent = () => {
          if (isOrgInviteByLink) {
            return `${WEBAPP_URL}/${searchParams.get("callbackUrl")}`;
          }

          return addOrUpdateQueryParam(`${WEBAPP_URL}/${searchParams.get("callbackUrl")}`, "from", "signup");
        };

        const constructCallBackIfUrlNotPresent = () => {
          if (!!isPlatformUser) {
            return `${WEBAPP_URL}/${gettingStartedWithPlatform}?from=signup`;
          }

          return `${WEBAPP_URL}/${verifyOrGettingStarted}?from=signup`;
        };

        const constructCallBackUrl = () => {
          const callbackUrlSearchParams = searchParams?.get("callbackUrl");

          return !!callbackUrlSearchParams
            ? constructCallBackIfUrlPresent()
            : constructCallBackIfUrlNotPresent();
        };

        const callBackUrl = constructCallBackUrl();

        await signIn<"credentials">("credentials", {
          ...data,
          callbackUrl: callBackUrl,
        });
      })
      .catch((err) => {
        formMethods.setError("apiError", { message: err.message });
      });
  };

  return (
    <>
      <div
        className={classNames(
          "light bg-muted flex min-h-screen w-full flex-col items-center justify-center",
          "[--cal-brand:#111827] dark:[--cal-brand:#FFFFFF]",
          "[--cal-brand-subtle:#9CA3AF]",
          "[--cal-brand-text:#FFFFFF] dark:[--cal-brand-text:#000000]",
          "[--cal-brand-emphasis:#101010] dark:[--cal-brand-emphasis:#e1e1e1] "
        )}>
        <div className="bg-muted border-subtle w-full max-w-md overflow-hidden rounded-[20px] border px-4 py-6 sm:px-6 lg:px-8">
          {/* Left side - now centered content */}
          <div className="flex w-full flex-col">
            {displayBackButton && (
              <div className="mb-6 flex w-fit">
                <Button
                  color="minimal"
                  className="hover:bg-subtle flex h-6 max-h-6 w-full items-center rounded-md px-3 py-2"
                  StartIcon="arrow-left"
                  data-testid="signup-back-button"
                  onClick={() => {
                    setDisplayEmailForm(false);
                  }}>
                  {t("back")}
                </Button>
              </div>
            )}
            <div className="flex flex-col gap-2 text-center">
              <h1 className="font-cal text-[28px] leading-none ">
                {IS_CALCOM ? t("create_your_calcom_account") : t("create_your_account")}
              </h1>
              {IS_CALCOM ? (
                <p className="text-subtle text-base font-medium leading-5">{t("cal_signup_description")}</p>
              ) : (
                <p className="text-subtle text-base font-medium leading-5">
                  {t("calcom_explained", {
                    appName: APP_NAME,
                  })}
                </p>
              )}
            </div>

            {/* Form Container */}
            {displayEmailForm && (
              <div className="mt-12">
                <Form
                  className="flex flex-col gap-4"
                  form={formMethods}
                  handleSubmit={async (values) => {
                    let updatedValues = values;
                    if (!formMethods.getValues().username && isOrgInviteByLink && orgAutoAcceptEmail) {
                      updatedValues = {
                        ...values,
                        username: getOrgUsernameFromEmail(values.email, orgAutoAcceptEmail),
                      };
                    }
                    await signUp(updatedValues);
                  }}>
                  {/* Username */}
                  {!isOrgInviteByLink ? (
                    <UsernameField
                      orgSlug={orgSlug}
                      label={t("username")}
                      username={watch("username") || ""}
                      premium={premiumUsername}
                      usernameTaken={usernameTaken}
                      disabled={!!orgSlug}
                      setUsernameTaken={(value) => setUsernameTaken(value)}
                      data-testid="signup-usernamefield"
                      setPremium={(value) => setPremiumUsername(value)}
                      addOnLeading={
                        orgSlug
                          ? `${getOrgFullOrigin(orgSlug, { protocol: true }).replace(
                              URL_PROTOCOL_REGEX,
                              ""
                            )}/`
                          : `${process.env.NEXT_PUBLIC_WEBSITE_URL.replace(URL_PROTOCOL_REGEX, "")}/`
                      }
                    />
                  ) : null}
                  {/* Email */}
                  <TextField
                    id="signup-email"
                    {...register("email")}
                    label={t("email")}
                    type="email"
                    autoComplete="email"
                    disabled={prepopulateFormValues?.email}
                    data-testid="signup-emailfield"
                  />

                  {/* Password */}
                  <PasswordField
                    id="signup-password"
                    data-testid="signup-passwordfield"
                    autoComplete="new-password"
                    label={t("password")}
                    {...register("password")}
                    hintErrors={["caplow", "min", "num"]}
                  />

                  {errors.apiError && (
                    <Alert
                      className="mb-3"
                      severity="error"
                      message={errors.apiError?.message}
                      data-testid="signup-error-message"
                    />
                  )}
                  <Button
                    type="submit"
                    data-testid="signup-submit-button"
                    className="my-2 w-full justify-center"
                    loading={loadingSubmitState}
                    disabled={
                      !!formMethods.formState.errors.username ||
                      !!formMethods.formState.errors.email ||
                      !formMethods.getValues("email") ||
                      !formMethods.getValues("password") ||
                      isSubmitting ||
                      usernameTaken
                    }>
                    {premiumUsername && !usernameTaken
                      ? `${t("create_account")} (${getPremiumPlanPriceValue()})`
                      : t("create_account")}
                  </Button>
                </Form>
              </div>
            )}
            {!displayEmailForm && (
              <div className="mt-12">
                {/* Upper Row */}
                <div className="mt-6 flex flex-col gap-2">
                  {isGoogleLoginEnabled ? (
                    <Button
                      color="primary"
                      loading={isGoogleLoading}
                      CustomStartIcon={
                        <img
                          className={classNames("text-subtle  mr-2 h-4 w-4", premiumUsername && "opacity-50")}
                          src="/google-icon-colored.svg"
                          alt="Continue with Google Icon"
                        />
                      }
                      className={classNames("w-full justify-center rounded-md text-center")}
                      data-testid="continue-with-google-button"
                      onClick={async () => {
                        setIsGoogleLoading(true);
                        const baseUrl = process.env.NEXT_PUBLIC_WEBAPP_URL;
                        const GOOGLE_AUTH_URL = `${baseUrl}/auth/sso/google`;
                        const searchQueryParams = new URLSearchParams();
                        if (prepopulateFormValues?.username) {
                          // If username is present we save it in query params to check for premium
                          searchQueryParams.set("username", prepopulateFormValues.username);
                          localStorage.setItem("username", prepopulateFormValues.username);
                        }
                        if (token) {
                          searchQueryParams.set("email", prepopulateFormValues?.email);
                        }
                        const url = searchQueryParams.toString()
                          ? `${GOOGLE_AUTH_URL}?${searchQueryParams.toString()}`
                          : GOOGLE_AUTH_URL;

                        router.push(url);
                      }}>
                      {t("continue_with_google")}
                    </Button>
                  ) : null}
                </div>

                {isGoogleLoginEnabled && (
                  <div className="mt-6">
                    <div className="relative flex items-center">
                      <div className="border-subtle flex-grow border-t" />
                      <span className="text-subtle mx-2 flex-shrink text-sm font-normal leading-none">
                        {t("or").toLocaleLowerCase()}
                      </span>
                      <div className="border-subtle flex-grow border-t" />
                    </div>
                  </div>
                )}

                {/* Lower Row */}
                <div className="mt-6 flex flex-col gap-2">
                  <Button
                    color="secondary"
                    disabled={isGoogleLoading}
                    className={classNames("w-full justify-center rounded-md text-center")}
                    onClick={() => {
                      setDisplayEmailForm(true);
                    }}
                    data-testid="continue-with-email-button">
                    {t("continue_with_email")}
                  </Button>
                </div>
              </div>
            )}

            {/* Already have an account & T&C */}
            <div className="mt-2 flex h-full flex-col justify-end pb-6 text-xs">
              <div className="flex flex-col text-center text-sm">
                <div className="flex justify-center gap-1">
                  <p className="text-subtle">{t("already_have_account")}</p>
                  <Link href="/auth/login" className="text-emphasis hover:underline">
                    {t("sign_in")}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Toaster position="bottom-right" />
      </div>
    </>
  );
}
