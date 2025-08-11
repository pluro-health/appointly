import { prisma } from "@calcom/prisma";

import type { TCreateCenterSchema } from "./schemas";

interface CreateCenterOptions {
  ctx: {
    user: any; // TrpcSessionUser when available
  };
  input: TCreateCenterSchema;
}

export default async function createCenterHandler({ input }: CreateCenterOptions) {
  const { name, address, phone, email, easebuzzSubMerchantId, isActive } = input;

  // Check if center with same sub-merchant ID already exists
  if (easebuzzSubMerchantId) {
    const existingCenter = await (prisma as any).center.findUnique({
      where: { easebuzzSubMerchantId },
    });

    if (existingCenter) {
      throw new Error("A center with this Easebuzz Sub-Merchant ID already exists");
    }
  }

  // Create the center
  const center = await (prisma as any).center.create({
    data: {
      name,
      address: address || null,
      phone: phone || null,
      email: email || null,
      easebuzzSubMerchantId: easebuzzSubMerchantId || null,
      isActive,
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
    center,
    message: `Medical center "${name}" created successfully`,
  };
}
