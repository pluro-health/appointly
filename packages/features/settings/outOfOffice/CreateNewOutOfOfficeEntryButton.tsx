"use client";

import { useState, useEffect } from "react";

import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { ButtonProps } from "@calcom/ui/components/button";
import { Button } from "@calcom/ui/components/button";

import { CreateOrEditOutOfOfficeEntryModal } from "./CreateOrEditOutOfOfficeModal";

const CreateNewOutOfOfficeEntry = ({
  size,
  ...rest
}: {
  size?: ButtonProps["size"];
  "data-testid"?: string;
}) => {
  const { t } = useLocale();

  const params = useCompatSearchParams();
  const openModalOnStart = !!params?.get("om");

  const [openModal, setOpenModal] = useState(false);

  useEffect(() => {
    if (openModalOnStart) setOpenModal(true);
  }, [openModalOnStart]);

  return (
    <>
      <Button
        color="primary"
        size={size ?? "base"}
        className="flex items-center justify-between px-4"
        StartIcon="plus"
        onClick={() => setOpenModal(true)}
        data-testid={rest["data-testid"]}>
        {t("add")}
      </Button>

      {openModal && (
        <CreateOrEditOutOfOfficeEntryModal
          openModal={openModal}
          closeModal={() => setOpenModal(false)}
          currentlyEditingOutOfOfficeEntry={null}
        />
      )}
    </>
  );
};

export default CreateNewOutOfOfficeEntry;
