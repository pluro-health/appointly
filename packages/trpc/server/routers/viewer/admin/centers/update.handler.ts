import { prisma } from "@calcom/prisma";

import type { TUpdateCenterSchema } from "./schemas";

interface UpdateCenterOptions {
  ctx: {
    user: any; // TrpcSessionUser when available
  };
  input: TUpdateCenterSchema;
}

export default async function updateCenterHandler({ input }: UpdateCenterOptions) {
  const { id, name, address, phone, email, easebuzzSubMerchantId, isActive, hmsCenterId } = input;

  // Check if center exists
  const existingCenter = await (prisma as any).center.findUnique({
    where: { id },
  });

  if (!existingCenter) {
    throw new Error("Center not found");
  }

  // Check if sub-merchant ID is being changed and conflicts with another center
  if (easebuzzSubMerchantId && easebuzzSubMerchantId !== existingCenter.easebuzzSubMerchantId) {
    const conflictingCenter = await (prisma as any).center.findUnique({
      where: { easebuzzSubMerchantId },
    });

    if (conflictingCenter && conflictingCenter.id !== id) {
      throw new Error("A center with this Easebuzz Sub-Merchant ID already exists");
    }
  }

  // Check if HMS Center ID is being changed and conflicts with another center
  if (hmsCenterId && hmsCenterId !== existingCenter.hmsCenterId) {
    const conflictingHmsCenter = await (prisma as any).center.findUnique({
      where: { hmsCenterId },
    });

    if (conflictingHmsCenter && conflictingHmsCenter.id !== id) {
      throw new Error("A center with this HMS Center ID already exists");
    }
  }
  // Check if HMS Center ID is being changed and conflicts with another center
  if (hmsCenterId && hmsCenterId !== existingCenter.hmsCenterId) {
    const conflictingHmsCenter = await (prisma as any).center.findUnique({
      where: { hmsCenterId },
    });

    if (conflictingHmsCenter && conflictingHmsCenter.id !== id) {
      throw new Error("A center with this HMS Center ID already exists");
    }
  }

  // Prepare update data (only include fields that are provided)
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (address !== undefined) updateData.address = address || null;
  if (phone !== undefined) updateData.phone = phone || null;
  if (email !== undefined) updateData.email = email || null;
  if (easebuzzSubMerchantId !== undefined) updateData.easebuzzSubMerchantId = easebuzzSubMerchantId || null;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (hmsCenterId !== undefined) updateData.hmsCenterId = hmsCenterId;

  // Update the center
  const updatedCenter = await (prisma as any).center.update({
    where: { id },
    data: updateData,
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
    center: updatedCenter,
    message: `Medical center "${updatedCenter.name}" updated successfully`,
  };
}
