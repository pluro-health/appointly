import { z } from "zod";

export const ZCreateCenterSchema = z.object({
  name: z.string().min(1, "Center name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  easebuzzSubMerchantId: z.string().optional(),
  isActive: z.boolean().default(true),
  hmsCenterId: z.string().min(1, "HMS Center ID is required"),
});

export const ZUpdateCenterSchema = z.object({
  id: z.number(),
  name: z.string().min(1, "Center name is required").optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  easebuzzSubMerchantId: z.string().optional(),
  isActive: z.boolean().optional(),
  hmsCenterId: z.string().min(1, "HMS Center ID is required").optional(),
});

export const ZDeleteCenterSchema = z.object({
  id: z.number(),
  hardDelete: z.boolean().default(false), // true for hard delete, false for soft delete
});

export const ZGetCenterSchema = z.object({
  id: z.number(),
});

export const ZListCentersSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  cursor: z.number().optional(),
  searchTerm: z.string().optional(),
  includeInactive: z.boolean().default(false),
});

export type TCreateCenterSchema = z.infer<typeof ZCreateCenterSchema>;
export type TUpdateCenterSchema = z.infer<typeof ZUpdateCenterSchema>;
export type TDeleteCenterSchema = z.infer<typeof ZDeleteCenterSchema>;
export type TGetCenterSchema = z.infer<typeof ZGetCenterSchema>;
export type TListCentersSchema = z.infer<typeof ZListCentersSchema>;
