import { prisma } from "@calcom/prisma";

import type { TListCentersSchema } from "./schemas";

interface ListCentersOptions {
  ctx: {
    user: any; // TrpcSessionUser when available
  };
  input: TListCentersSchema;
}

export default async function listCentersHandler({ input }: ListCentersOptions) {
  const { cursor, limit, searchTerm, includeInactive } = input;

  // Build where conditions
  const whereConditions: any = {};

  // Filter by active status unless specifically including inactive
  if (!includeInactive) {
    whereConditions.isActive = true;
  }

  // Add search conditions
  if (searchTerm) {
    whereConditions.OR = [
      {
        name: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
      {
        address: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
      {
        easebuzzSubMerchantId: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
    ];
  }

  // Get total count for metadata
  const totalCount = await (prisma as any).center.count({
    where: whereConditions,
  });

  // Fetch centers with pagination
  const centers = await (prisma as any).center.findMany({
    cursor: cursor ? { id: cursor } : undefined,
    take: limit + 1, // Take one extra to determine if there are more pages
    where: whereConditions,
    orderBy: {
      createdAt: "desc",
    },
    include: {
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

  // Determine next cursor
  let nextCursor: typeof cursor | undefined = undefined;
  if (centers.length > limit) {
    const nextItem = centers.pop(); // Remove the extra item
    nextCursor = nextItem?.id;
  }

  return {
    centers: centers || [],
    nextCursor,
    meta: {
      totalRowCount: totalCount,
    },
  };
}
