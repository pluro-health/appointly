import { prisma } from "@calcom/prisma";

import type { TDeleteCenterSchema } from "./schemas";

interface DeleteCenterOptions {
  ctx: {
    user: any; // TrpcSessionUser when available
  };
  input: TDeleteCenterSchema;
}

export default async function deleteCenterHandler({ input }: DeleteCenterOptions) {
  const { id, hardDelete } = input;

  // Check if center exists
  const existingCenter = await (prisma as any).center.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          users: true,
          easebuzzPayments: true,
        },
      },
    },
  });

  if (!existingCenter) {
    throw new Error("Center not found");
  }

  if (hardDelete) {
    // Hard delete: Check if center has associated data
    if (existingCenter._count.users > 0) {
      throw new Error(
        `Cannot delete center "${existingCenter.name}" because it has ${existingCenter._count.users} associated users. Please reassign users to another center first.`
      );
    }

    // Note: EasebuzzPayments will be preserved due to onDelete: SetNull relationship
    await (prisma as any).center.delete({
      where: { id },
    });

    return {
      message: `Medical center "${existingCenter.name}" permanently deleted`,
      deletedCenter: existingCenter,
    };
  } else {
    // Soft delete: Mark as inactive and set deletedAt timestamp
    const softDeletedCenter = await (prisma as any).center.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
      include: {
        _count: {
          select: {
            users: true,
            easebuzzPayments: true,
          },
        },
      },
    });

    return {
      message: `Medical center "${existingCenter.name}" deactivated successfully`,
      center: softDeletedCenter,
    };
  }
}
