import { _generateMetadata } from "app/_utils";
import { redirect } from "next/navigation";

export const generateMetadata = async ({ params }: { params: Promise<{ category: string }> }) =>
  await _generateMetadata(
    (t) => t("connected_apps"),
    (t) => t("connected_apps_description"),
    undefined,
    undefined,
    `/settings/admin/connected-apps/${(await params).category}`
  );

const Page = () => {
  redirect("/settings/admin/connected-apps");
};

export default Page;
