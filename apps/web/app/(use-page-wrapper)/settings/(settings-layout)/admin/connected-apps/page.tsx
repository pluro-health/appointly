import { _generateMetadata } from "app/_utils";
import { getTranslate } from "app/_utils";

import ConnectedAppsList from "@calcom/features/admin/apps/ConnectedAppsList";
import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("connected_apps"),
    (t) => t("connected_apps_description"),
    undefined,
    undefined,
    "/settings/admin/connected-apps"
  );

const Page = async () => {
  const t = await getTranslate();

  return (
    <SettingsHeader title="Connected Apps" description="Manage your connected apps">
      <div className="flex">
        <ConnectedAppsList
          baseURL="/settings/admin/connected-apps"
          classNames={{
            appCategoryNavigationRoot: "overflow-x-scroll",
          }}
        />
      </div>
    </SettingsHeader>
  );
};

export default Page;
