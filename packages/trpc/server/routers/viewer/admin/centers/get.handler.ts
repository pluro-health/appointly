import { prisma } from "@calcom/prisma";

import type { TGetCenterSchema } from "./schemas";

interface GetCenterOptions {
  ctx: {
    user: any; // TrpcSessionUser when available
  };
  input: TGetCenterSchema;
}

export default async function getCenterHandler({ input }: GetCenterOptions) {
  const { id } = input;

  const center = await (prisma as any).center.findUnique({
    where: { id },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          avatarUrl: true,
          role: true,
        },
      },
      easebuzzPayments: {
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          booking: {
            select: {
              id: true,
              title: true,
              startTime: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10, // Latest 10 payments for preview
      },
      _count: {
        select: {
          users: true,
          easebuzzPayments: {
            where: {
              status: "SUCCESS",
            },
          },
        },
      },
    },
  });

  if (!center) {
    throw new Error("Center not found");
  }

  return { center };
}
