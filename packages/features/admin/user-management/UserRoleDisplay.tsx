"use client";

import { useSession } from "next-auth/react";

import { UserPermissionRole } from "@calcom/prisma/enums";
import { Badge } from "@calcom/ui/components/badge";

export function UserRoleDisplay() {
  const { data: session } = useSession();

  const userRole = session?.user?.role;

  if (!userRole) return null;

  const getRoleBadgeColor = (role: UserPermissionRole | "INACTIVE_ADMIN") => {
    switch (role) {
      case UserPermissionRole.ADMIN:
        return "red";

      case UserPermissionRole.USER:
        return "blue";

      default:
        return "gray";
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-600">Role:</span>

      <Badge variant={getRoleBadgeColor(userRole)}>{userRole}</Badge>
    </div>
  );
}
