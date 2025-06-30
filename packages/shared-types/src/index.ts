import { z } from 'zod';

// User schemas
export const UserRoleSchema = z.enum(['ADMIN', 'CLIENT', 'RESELLER']);
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  role: UserRoleSchema,
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Client schemas
export const ClientStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export const ClientSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyName: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  country: z.string().nullable(),
  phone: z.string().nullable(),
  status: ClientStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Billing schemas
export const BillingIntervalSchema = z.enum(['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY']);
export const SubscriptionStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'CANCELLED', 'PAST_DUE']);
export const InvoiceStatusSchema = z.enum(['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED']);
export const PaymentStatusSchema = z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']);

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number(),
  currency: z.string(),
  interval: BillingIntervalSchema,
  isActive: z.boolean(),
  features: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const InvoiceSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  userId: z.string(),
  subscriptionId: z.string().nullable(),
  invoiceNumber: z.string(),
  status: InvoiceStatusSchema,
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
  currency: z.string(),
  dueDate: z.date(),
  paidAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Export types
export type UserRole = z.infer<typeof UserRoleSchema>;
export type User = z.infer<typeof UserSchema>;
export type ClientStatus = z.infer<typeof ClientStatusSchema>;
export type Client = z.infer<typeof ClientSchema>;
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;