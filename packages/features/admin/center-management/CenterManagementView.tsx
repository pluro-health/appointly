"use client";

import { useState } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogContent, DialogFooter } from "@calcom/ui/components/dialog";
import { ConfirmationDialogContent } from "@calcom/ui/components/dialog";
import { TextField } from "@calcom/ui/components/form";
import { Switch } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@calcom/ui/components/table";
import { DropdownActions } from "@calcom/ui/components/table";
import { showToast } from "@calcom/ui/components/toast";

interface Center {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  easebuzzSubMerchantId: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  hmsCenterId: string | null;
  _count: {
    users: number;
    easebuzzPayments: number;
  };
}

interface CenterFormData {
  name: string;
  address: string;
  phone: string;
  email: string;
  easebuzzSubMerchantId: string;
  hmsCenterId: string;
  isActive: boolean;
}

export function CenterManagementView() {
  const { t } = useLocale();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [centerToDelete, setCenterToDelete] = useState<number | null>(null);
  const [editingCenter, setEditingCenter] = useState<Center | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [formData, setFormData] = useState<CenterFormData>({
    name: "",
    address: "",
    phone: "",
    email: "",
    easebuzzSubMerchantId: "",
    hmsCenterId: "",
    isActive: true,
  });

  // Fetch centers with auto-refresh
  const { data: centersData, refetch: refetchCenters } = trpc.viewer.admin.centers.list.useInfiniteQuery(
    {
      limit: 50,
      searchTerm: searchTerm || undefined,
      includeInactive,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchInterval: 30000, // Refresh every 30 seconds
      refetchOnWindowFocus: true,
    }
  );

  // Create center mutation
  const createCenterMutation = trpc.viewer.admin.centers.create.useMutation({
    onSuccess: (data) => {
      showToast(data.message, "success");
      setIsCreateDialogOpen(false);
      resetForm();
      refetchCenters();
    },
    onError: (error) => {
      showToast(error.message || "Failed to create center", "error");
    },
  });

  // Update center mutation
  const updateCenterMutation = trpc.viewer.admin.centers.update.useMutation({
    onSuccess: (data) => {
      showToast(data.message, "success");
      setIsEditDialogOpen(false);
      setEditingCenter(null);
      resetForm();
      refetchCenters();
    },
    onError: (error) => {
      showToast(error.message || "Failed to update center", "error");
    },
  });

  // Delete center mutation
  const deleteCenterMutation = trpc.viewer.admin.centers.delete.useMutation({
    onSuccess: (data) => {
      showToast(data.message, "success");
      setCenterToDelete(null);
      refetchCenters();
    },
    onError: (error) => {
      showToast(error.message || "Failed to delete center", "error");
    },
  });

  const flatCenters = centersData?.pages?.flatMap((page) => page.centers) ?? [];

  const resetForm = () => {
    setFormData({
      name: "",
      address: "",
      phone: "",
      email: "",
      easebuzzSubMerchantId: "",
      hmsCenterId: "",
      isActive: true,
    });
  };

  const handleCreateCenter = async () => {
    if (!formData.name.trim()) {
      showToast("Please enter a center name", "error");
      return;
    }
    if (!formData.hmsCenterId.trim()) {
      showToast("Please enter HMS Center ID", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await createCenterMutation.mutateAsync({
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim() || undefined,
        easebuzzSubMerchantId: formData.easebuzzSubMerchantId.trim() || undefined,
        hmsCenterId: formData.hmsCenterId.trim(),
        isActive: formData.isActive,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCenter = async () => {
    if (!editingCenter || !formData.name.trim()) {
      showToast("Please enter a center name", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateCenterMutation.mutateAsync({
        id: editingCenter.id,
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim() || undefined,
        easebuzzSubMerchantId: formData.easebuzzSubMerchantId.trim() || undefined,
        hmsCenterId: formData.hmsCenterId.trim(),
        isActive: formData.isActive,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditCenter = (center: Center) => {
    setEditingCenter(center);
    setFormData({
      name: center.name,
      address: center.address || "",
      phone: center.phone || "",
      email: center.email || "",
      easebuzzSubMerchantId: center.easebuzzSubMerchantId || "",
      hmsCenterId: center.hmsCenterId || "",
      isActive: center.isActive,
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteCenter = async (hardDelete = false) => {
    if (!centerToDelete) return;

    try {
      await deleteCenterMutation.mutateAsync({
        id: centerToDelete,
        hardDelete,
      });
    } catch (error) {
      // Error is handled in the mutation
    }
  };

  const getStatusBadge = (center: Center) => {
    if (!center.isActive || center.deletedAt) {
      return <Badge variant="orange">Inactive</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Medical Centers</h2>
          <p className="text-sm text-gray-600">Manage medical centers and facilities</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button color="secondary" onClick={() => refetchCenters()}>
            <Icon name="refresh-cw" className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Icon name="plus" className="mr-2 h-4 w-4" />
            Add Center
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <TextField
            placeholder="Search centers by name, email, address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-2">
          <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} />
          <span className="text-sm">Include inactive centers</span>
        </div>
      </div>

      {/* Centers Table */}
      <div className="border-subtle rounded-md border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Center</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Sub-Merchant ID</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Payments</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flatCenters.map((center) => (
                <TableRow key={center.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{center.name}</div>
                      {center.address && <div className="text-sm text-gray-500">{center.address}</div>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {center.email && <div>{center.email}</div>}
                      {center.phone && <div>{center.phone}</div>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {center.easebuzzSubMerchantId ? (
                      <code className="rounded bg-gray-100 px-1 text-sm">{center.easebuzzSubMerchantId}</code>
                    ) : (
                      <span className="text-sm text-gray-400">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="gray">{center._count.users}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="gray">{center._count.easebuzzPayments}</Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(center)}</TableCell>
                  <TableCell className="w-auto">
                    <div className="flex w-full justify-end">
                      <DropdownActions
                        actions={[
                          {
                            id: "edit",
                            label: "Edit Center",
                            onClick: () => handleEditCenter(center),
                            icon: "pencil" as const,
                          },
                          {
                            id: "soft-delete",
                            label: center.isActive ? "Deactivate Center" : "Activate Center",
                            onClick: () => {
                              if (center.isActive) {
                                setCenterToDelete(center.id);
                              } else {
                                // Reactivate center
                                updateCenterMutation.mutate({
                                  id: center.id,
                                  isActive: true,
                                });
                              }
                            },
                            icon: center.isActive ? "eye-off" : "eye",
                            color: center.isActive ? "destructive" : "secondary",
                          },
                          {
                            id: "hard-delete",
                            label: "Delete Permanently",
                            onClick: () => setCenterToDelete(center.id),
                            icon: "trash" as const,
                            color: "destructive",
                            disabled: center._count.users > 0,
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

      {/* Create Center Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent title="Add New Medical Center" type="creation">
          <div className="space-y-4">
            <TextField
              label="Center Name"
              placeholder="Enter center name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <TextField
              label="Address"
              placeholder="Enter address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Phone"
                placeholder="Enter phone number"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
              <TextField
                label="Email"
                type="email"
                placeholder="Enter email address"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <TextField
              label="HMS Center ID"
              placeholder="Enter HMS Center ID"
              value={formData.hmsCenterId}
              onChange={(e) => setFormData({ ...formData, hmsCenterId: e.target.value })}
              required
            />
            <TextField
              label="Easebuzz Sub-Merchant ID"
              placeholder="Enter sub-merchant ID"
              value={formData.easebuzzSubMerchantId}
              onChange={(e) => setFormData({ ...formData, easebuzzSubMerchantId: e.target.value })}
            />
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: !!checked })}
              />
              <span className="text-sm">Center is active and accepting patients</span>
            </div>
          </div>
          <DialogFooter>
            <Button color="secondary" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCenter} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Center"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Center Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent title="Edit Medical Center" type="creation">
          <div className="space-y-4">
            <TextField
              label="Center Name"
              placeholder="Enter center name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <TextField
              label="Address"
              placeholder="Enter address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label="Phone"
                placeholder="Enter phone number"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
              <TextField
                label="Email"
                type="email"
                placeholder="Enter email address"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <TextField
              label="HMS Center ID"
              placeholder="Enter HMS Center ID"
              value={formData.hmsCenterId}
              onChange={(e) => setFormData({ ...formData, hmsCenterId: e.target.value })}
            />
            <TextField
              label="Easebuzz Sub-Merchant ID"
              placeholder="Enter sub-merchant ID"
              value={formData.easebuzzSubMerchantId}
              onChange={(e) => setFormData({ ...formData, easebuzzSubMerchantId: e.target.value })}
            />
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: !!checked })}
              />
              <span className="text-sm">Center is active and accepting patients</span>
            </div>
          </div>
          <DialogFooter>
            <Button color="secondary" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateCenter} disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update Center"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Center Confirmation Dialog */}
      <Dialog open={!!centerToDelete} onOpenChange={() => setCenterToDelete(null)}>
        <DialogContent>
          <ConfirmationDialogContent
            variety="danger"
            title="Delete Medical Center"
            confirmBtnText="Deactivate Center"
            onConfirm={() => handleDeleteCenter(false)}>
            <p>
              Are you sure you want to deactivate this medical center? The center will be marked as inactive
              but all data will be preserved.
            </p>
            <div className="mt-4">
              <Button color="destructive" onClick={() => handleDeleteCenter(true)} className="w-full">
                Delete Permanently (Cannot be undone)
              </Button>
            </div>
          </ConfirmationDialogContent>
        </DialogContent>
      </Dialog>
    </div>
  );
}
