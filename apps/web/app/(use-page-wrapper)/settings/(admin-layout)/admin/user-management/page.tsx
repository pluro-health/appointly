import { _generateMetadata, getTranslate } from "app/_utils";

import { UserManagementView } from "@calcom/features/admin/user-management/UserManagementView";
import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("user_management"),
    (t) => t("admin_user_management_description"),
    undefined,
    undefined,
    "/settings/admin/user-management"
  );

const Page = async () => {
  const t = await getTranslate();
  return (
    <SettingsHeader
      title={t("User Management")}
      description={t("Manage users and send invitations for new user registration")}>
      <UserManagementView />
    </SettingsHeader>
  );
};

export default Page;
