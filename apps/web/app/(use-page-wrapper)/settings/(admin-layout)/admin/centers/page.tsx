import { getTranslate } from "app/_utils";

import { CenterManagementView } from "@calcom/features/admin/center-management/CenterManagementView";
import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";

const Page = async () => {
  const t = await getTranslate();
  return (
    <SettingsHeader
      title="Medical Centers"
      description="Manage medical centers and facilities in your system">
      <CenterManagementView />
    </SettingsHeader>
  );
};

export default Page;
