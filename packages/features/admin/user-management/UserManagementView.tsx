"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogContent, DialogFooter, DialogClose } from "@calcom/ui/components/dialog";
import { ConfirmationDialogContent } from "@calcom/ui/components/dialog";
import { TextField } from "@calcom/ui/components/form";
import { Select } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@calcom/ui/components/table";
import { DropdownActions } from "@calcom/ui/components/table";
import { showToast } from "@calcom/ui/components/toast";

interface User {
  id: number;
  email: string;
  name: string | null;
  username: string | null;
  role: UserPermissionRole;
  createdAt: Date;
  emailVerified: Date | null;
  center?: {
    id: number;
    name: string;
    address: string | null;
  } | null;
}

interface InvitationToken {
  id: number;
  email: string;
  role: UserPermissionRole;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  invitedBy: {
    id: number;
    name: string | null;
    email: string;
  };
  center?: {
    id: number;
    name: string;
    address: string | null;
  } | null;
}

export function UserManagementView() {
  const { t } = useLocale();
  const router = useRouter();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserPermissionRole>(UserPermissionRole.USER);
  const [inviteCenterId, setInviteCenterId] = useState<number | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [userToDelete, setUserToDelete] = useState<number | null>(null);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [invitationToDelete, setInvitationToDelete] = useState<number | null>(null);
  const [isReplacingInvitation, setIsReplacingInvitation] = useState(false);

  // Fetch users and invitations with auto-refresh
  const { data: users, refetch: refetchUsers } = trpc.viewer.admin.listPaginated.useInfiniteQuery(
    { limit: 100 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  const { data: invitations, refetch: refetchInvitations } = trpc.viewer.admin.getInvitations.useQuery(
    undefined,
    {
      refetchInterval: 10000, // Refresh every 10 seconds
      refetchOnWindowFocus: true,
    }
  );

  // Get current user info
  const { data: currentUser } = trpc.viewer.me.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Fetch centers for user assignment
  const { data: centersData } = trpc.viewer.admin.centers.list.useQuery({
    limit: 100,
    includeInactive: false,
  });

  // Send invitation mutation
  const sendInvitationMutation = trpc.viewer.admin.sendInvitation.useMutation({
    onSuccess: () => {
      showToast("Invitation sent successfully", "success");
      setIsInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole(UserPermissionRole.USER);
      setInviteCenterId(null);
      refetchInvitations();
    },
    onError: (error) => {
      showToast(error.message || "Failed to send invitation", "error");
    },
  });

  // Delete user mutation
  const deleteUserMutation = trpc.viewer.admin.deleteUser.useMutation({
    onSuccess: () => {
      showToast("User deleted successfully", "success");
      setUserToDelete(null);
      refetchUsers();
    },
    onError: (error) => {
      showToast(error.message || "Failed to delete user", "error");
    },
  });

  // Update user mutation
  const updateUserMutation = trpc.viewer.admin.updateUser.useMutation({
    onSuccess: () => {
      showToast("User updated successfully", "success");
      setUserToEdit(null);
      refetchUsers();
    },
    onError: (error) => {
      showToast(error.message || "Failed to update user", "error");
    },
  });

  // Resend email verification mutation
  const resendEmailVerificationMutation = trpc.viewer.admin.resendEmailVerification.useMutation({
    onSuccess: () => {
      showToast("Verification email sent successfully", "success");
    },
    onError: (error) => {
      showToast(error.message || "Failed to send verification email", "error");
    },
  });

  // Delete invitation mutation
  const deleteInvitationMutation = trpc.viewer.admin.deleteInvitation.useMutation({
    onSuccess: () => {
      showToast("Invitation deleted successfully", "success");
      setInvitationToDelete(null);
      refetchInvitations();
    },
    onError: (error) => {
      showToast(error.message || "Failed to delete invitation", "error");
    },
  });

  // Resend invitation email mutation
  const resendInvitationEmailMutation = trpc.viewer.admin.resendInvitationEmail.useMutation({
    onSuccess: () => {
      showToast("Invitation email resent successfully", "success");
    },
    onError: (error) => {
      showToast(error.message || "Failed to resend invitation email", "error");
    },
  });

  // Auto-refresh data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refetchUsers();
      refetchInvitations();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [refetchUsers, refetchInvitations]);

  const handleSendInvitation = async () => {
    if (!inviteEmail || typeof inviteEmail !== "string") {
      showToast("Please enter a valid email address", "error");
      return;
    }

    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail) {
      showToast("Please enter a valid email address", "error");
      return;
    }

    setIsInviting(true);
    try {
      await sendInvitationMutation.mutateAsync({
        email: trimmedEmail,
        role: inviteRole,
        expiresInHours: 24,
        replaceExisting: isReplacingInvitation,
        centerId: inviteCenterId || undefined,
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      // Get user email before deletion
      const userToDeleteData = flatUsers.find((user: any) => user.id === userToDelete);
      const userEmail = userToDeleteData?.email;

      await deleteUserMutation.mutateAsync({ userId: userToDelete });

      // If we have the email, offer to create a new invitation
      if (userEmail) {
        setInviteEmail(userEmail);
        setInviteRole(userToDeleteData?.role || UserPermissionRole.USER);
        setIsReplacingInvitation(true);
        setIsInviteDialogOpen(true);
      }
    } catch (error) {
      // Error is handled in the mutation
    }
  };

  const handleUpdateUser = async (userId: number, centerId: number | null, password: string) => {
    try {
      const updateData: any = {};

      // Always include centerId (can be null to remove center assignment)
      updateData.centerId = centerId;

      if (password.trim()) {
        updateData.password = password;
      }

      await updateUserMutation.mutateAsync({
        userId,
        ...updateData,
      });
    } catch (error) {
      // Error is handled in the mutation
    }
  };

  const handleResendVerification = async (userId: number) => {
    try {
      await resendEmailVerificationMutation.mutateAsync({ userId });
    } catch (error) {
      // Error is handled in the mutation
    }
  };

  const handleDeleteInvitation = async () => {
    if (!invitationToDelete) return;

    try {
      await deleteInvitationMutation.mutateAsync({ invitationId: invitationToDelete });
    } catch (error) {
      // Error is handled in the mutation
    }
  };

  const handleResendInvitationEmail = async (invitationId: number) => {
    try {
      await resendInvitationEmailMutation.mutateAsync({ invitationId });
    } catch (error) {
      // Error is handled in the mutation
    }
  };

  const flatUsers = users?.pages?.flatMap((page) => page.rows) ?? [];

  const getRoleBadgeColor = (role: UserPermissionRole) => {
    switch (role) {
      case UserPermissionRole.ADMIN:
        return "red";
      case UserPermissionRole.USER:
        return "blue";
      default:
        return "gray";
    }
  };

  const getStatusBadge = (user: User) => {
    if (!user.emailVerified) {
      return <Badge variant="orange">Unverified</Badge>;
    }
    return <Badge variant="default">Verified</Badge>;
  };

  const roleOptions = [
    { value: UserPermissionRole.USER, label: "User" },
    { value: UserPermissionRole.ADMIN, label: "Admin" },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Invite Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Add Users</h2>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="button"
            onClick={() => {
              refetchUsers();
              refetchInvitations();
            }}>
            <Icon name="refresh-cw" className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <Button onClick={() => setIsInviteDialogOpen(true)}>
              <Icon name="plus" className="mr-2 h-4 w-4" />
              Send Invitation
            </Button>
            <DialogContent title="Send User Invitation">
              <div className="space-y-4">
                <TextField
                  label="Email Address"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value.trim())}
                  type="email"
                  required
                  autoComplete="email"
                />
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role</label>
                  <Select
                    options={roleOptions}
                    value={roleOptions.find((option) => option.value === inviteRole)}
                    onChange={(value: any) => setInviteRole(value?.value || UserPermissionRole.USER)}
                    placeholder="Select role"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Medical Center (Optional)</label>
                  <Select
                    options={[
                      { value: null, label: "No center assigned" },
                      ...(centersData?.centers || []).map((center: { id: number; name: string }) => ({
                        value: center.id,
                        label: center.name,
                      })),
                    ]}
                    value={
                      inviteCenterId
                        ? {
                            value: inviteCenterId,
                            label:
                              centersData?.centers?.find(
                                (c: { id: number; name: string }) => c.id === inviteCenterId
                              )?.name || "",
                          }
                        : { value: null, label: "No center assigned" }
                    }
                    onChange={(value: any) => setInviteCenterId(value?.value || null)}
                    placeholder="Select medical center"
                  />
                  <p className="text-xs text-gray-500">
                    Assign the user to a specific medical center. This can be changed later.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Options</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="replaceExisting"
                      checked={isReplacingInvitation}
                      onChange={(e) => setIsReplacingInvitation(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="replaceExisting" className="text-sm text-gray-600">
                      Replace existing invitations for this email
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">
                    Check this if you want to send a fresh invitation, invalidating any previous invitations
                    for this email.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <DialogClose />
                <Button onClick={handleSendInvitation} disabled={isInviting}>
                  {isInviting ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Users Table */}
      <div className="border-subtle rounded-md border">
        <div className="p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Registered Users</h3>
            <p className="text-sm text-gray-600">Manage existing users in the system</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Medical Center</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flatUsers.map((user: any) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="min-h-10 flex">
                      <Avatar size="md" alt={user.name || user.username || "User"} imageSrc={undefined} />
                      <div className="text-subtle ml-4 font-medium">
                        <div className="flex gap-3">
                          <span className="text-default">{user.name || "No name"}</span>
                          <span>/{user.username || "no-username"}</span>
                          {currentUser?.id === user.id && (
                            <Badge variant="blue" className="ml-2">
                              You
                            </Badge>
                          )}
                        </div>
                        <span className="break-all">{user.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {user.center ? (
                      <div className="text-sm">
                        <div className="font-medium">{user.center.name}</div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">No center assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeColor(user.role)}>{user.role}</Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(user)}</TableCell>
                  <TableCell>
                    <div className="flex w-full justify-end">
                      <DropdownActions
                        actions={[
                          ...(!user.emailVerified
                            ? [
                                {
                                  id: "resend-verification",
                                  label: "Resend Verification",
                                  onClick: () => handleResendVerification(user.id),
                                  icon: "mail" as const,
                                  disabled: resendEmailVerificationMutation.isPending,
                                },
                              ]
                            : []),
                          ...(currentUser?.id !== user.id
                            ? [
                                {
                                  id: "edit",
                                  label: "Edit User",
                                  onClick: () => setUserToEdit(user),
                                  icon: "pencil" as const,
                                },
                                {
                                  id: "delete",
                                  label: "Delete User",
                                  onClick: () => setUserToDelete(user.id),
                                  icon: "trash" as const,
                                  color: "destructive" as const,
                                },
                              ]
                            : [
                                {
                                  id: "cannot-delete",
                                  label: "You cannot delete your own account",
                                  icon: "info" as const,
                                  disabled: true,
                                },
                              ]),
                        ]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pending Invitations */}
      {invitations && invitations.length > 0 && (
        <div className="border-subtle rounded-md border">
          <div className="p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Active Invitations</h3>
              <p className="text-sm text-gray-600">Track unused invitations and their status</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Medical Center</TableHead>
                  <TableHead>Invited By</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation: InvitationToken) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeColor(invitation.role)}>{invitation.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {invitation.center ? (
                        <div className="text-sm">
                          <div className="font-medium">{invitation.center.name}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">No center assigned</span>
                      )}
                    </TableCell>
                    <TableCell>{invitation.invitedBy.name || invitation.invitedBy.email}</TableCell>
                    <TableCell>{new Date(invitation.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(invitation.expiresAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {new Date() > new Date(invitation.expiresAt) ? (
                        <Badge variant="red">Expired</Badge>
                      ) : (
                        <Badge variant="gray">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex w-full justify-end">
                        <DropdownActions
                          actions={[
                            {
                              id: "resend-invitation",
                              label: "Resend Invitation",
                              onClick: () => handleResendInvitationEmail(invitation.id),
                              icon: "mail",
                              disabled: resendInvitationEmailMutation.isPending,
                            },
                            {
                              id: "delete-invitation",
                              label: "Delete Invitation",
                              onClick: () => setInvitationToDelete(invitation.id),
                              icon: "trash",
                              color: "destructive",
                            },
                          ]}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Edit User Dialog */}
      <Dialog open={!!userToEdit} onOpenChange={(open) => !open && setUserToEdit(null)}>
        <DialogContent title="Edit User">
          {userToEdit && (
            <EditUserForm
              user={userToEdit}
              centers={centersData?.centers || []}
              onSave={handleUpdateUser}
              onCancel={() => setUserToEdit(null)}
              isPending={updateUserMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <ConfirmationDialogContent
          title="Delete User"
          confirmBtnText="Delete"
          cancelBtnText="Cancel"
          variety="danger"
          onConfirm={handleDeleteUser}
          isPending={deleteUserMutation.isPending}>
          <p>Are you sure you want to delete this user? This action cannot be undone.</p>
          <p className="mt-2 text-sm text-gray-600">
            After deletion, you willll have the option to send a new invitation to this email address.
          </p>
        </ConfirmationDialogContent>
      </Dialog>

      {/* Delete Invitation Confirmation Dialog */}
      <Dialog open={!!invitationToDelete} onOpenChange={(open) => !open && setInvitationToDelete(null)}>
        <ConfirmationDialogContent
          title="Delete Invitation"
          confirmBtnText="Delete"
          cancelBtnText="Cancel"
          variety="danger"
          onConfirm={handleDeleteInvitation}
          isPending={deleteInvitationMutation.isPending}>
          <p>Are you sure you want to delete this invitation? This action cannot be undone.</p>
        </ConfirmationDialogContent>
      </Dialog>
    </div>
  );
}

interface EditUserFormProps {
  user: User;
  centers: Array<{ id: number; name: string; address: string | null }>;
  onSave: (userId: number, centerId: number | null, password: string) => void;
  onCancel: () => void;
  isPending: boolean;
}

function EditUserForm({ user, centers, onSave, onCancel, isPending }: EditUserFormProps) {
  const [centerId, setCenterId] = useState<number | null>(user.center?.id || null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(user.id, centerId, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Email: {user.email}</label>
        <p className="text-xs text-gray-500">Email cannot be changed</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Name: {user.name || "No name provided"}</label>
        <p className="text-xs text-gray-500">Name cannot be changed</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Medical Center</label>
        <Select
          options={[
            { value: null, label: "No center assigned" },
            ...centers.map((center) => ({
              value: center.id,
              label: center.name,
            })),
          ]}
          value={
            centerId
              ? {
                  value: centerId,
                  label: centers.find((c) => c.id === centerId)?.name || "",
                }
              : { value: null, label: "No center assigned" }
          }
          onChange={(value: any) => setCenterId(value?.value || null)}
          placeholder="Select medical center"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">New Password (Optional)</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep current password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 transform text-gray-500 hover:text-gray-700">
            <Icon name={showPassword ? "eye-off" : "eye"} className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Enter a new password to change it, or leave blank to keep the current password
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
