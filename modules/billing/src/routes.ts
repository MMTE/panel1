import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { Panel1AuthUser } from '@panel1/core';
import type { ModuleContext } from '@panel1/types';
import type { IBillingService } from './types.js';
import { SEED_PERM } from './seed-permissions.js';
import { sql } from 'drizzle-orm';

function routePerm(ctx: ModuleContext, ...ids: string[]): MiddlewareHandler[] {
  const rp = ctx.requirePermission;
  if (!rp) {
    throw new Error('@panel1/mod-billing: host must pass requirePermission via bootModules()');
  }
  return [rp(...ids) as MiddlewareHandler];
}

const InvoiceItemSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  description: z.string(),
  quantity: z.number().nullable(),
  unitPrice: z.string().nullable(),
  total: z.string().nullable(),
});

const InvoiceSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  userId: z.string().nullable(),
  subscriptionId: z.string().nullable(),
  invoiceNumber: z.string(),
  status: z.string().nullable(),
  subtotal: z.string().nullable(),
  tax: z.string().nullable(),
  total: z.string().nullable(),
  currency: z.string().nullable(),
  dueDate: z.string().nullable(),
  paidAt: z.string().nullable(),
  invoiceType: z.string().nullable(),
  parentInvoiceId: z.string().nullable(),
  tenantId: z.string(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const InvoiceWithItemsSchema = z.object({
  ...InvoiceSchema.shape,
  items: z.array(InvoiceItemSchema),
});

const PaginatedInvoicesSchema = z.object({
  invoices: z.array(InvoiceSchema),
  total: z.number(),
  hasMore: z.boolean(),
});

const ErrorSchema = z.object({ error: z.string() });

const StatsSchema = z.object({
  totalInvoices: z.number(),
  totalAmount: z.number(),
  paidAmount: z.number(),
  pendingAmount: z.number(),
  overdueAmount: z.number(),
});

const listInvoicesRoute = createRoute({
  method: 'get',
  path: '/invoices',
  request: {
    query: z.object({
      status: z.enum(['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
      search: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      clientId: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    }),
  },
  responses: {
    200: { content: { 'application/json': { schema: PaginatedInvoicesSchema } }, description: 'List invoices' },
  },
});

const getInvoiceRoute = createRoute({
  method: 'get',
  path: '/invoices/{id}',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: InvoiceWithItemsSchema } }, description: 'Invoice with items' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const createInvoiceRoute = createRoute({
  method: 'post',
  path: '/invoices',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            clientId: z.string().uuid(),
            subscriptionId: z.string().uuid().optional(),
            items: z.array(z.object({
              description: z.string().min(1),
              quantity: z.number().int().min(1).default(1),
              unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
            })).min(1),
            tax: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
            dueDate: z.string(),
            currency: z.string().default('USD'),
          }),
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: InvoiceSchema } }, description: 'Invoice created' },
  },
});

const updateInvoiceRoute = createRoute({
  method: 'put',
  path: '/invoices/{id}',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            status: z.enum(['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
            dueDate: z.string().optional(),
            currency: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: InvoiceSchema } }, description: 'Invoice updated' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const deleteInvoiceRoute = createRoute({
  method: 'delete',
  path: '/invoices/{id}',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Invoice deleted' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const sendInvoiceRoute = createRoute({
  method: 'post',
  path: '/invoices/{id}/send',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Invoice sent' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const markPaidRoute = createRoute({
  method: 'post',
  path: '/invoices/{id}/pay',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            paymentId: z.string(),
            amount: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: InvoiceSchema } }, description: 'Invoice marked paid' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const getPdfRoute = createRoute({
  method: 'get',
  path: '/invoices/{id}/pdf',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: { description: 'PDF file' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const createCreditRoute = createRoute({
  method: 'post',
  path: '/invoices/{id}/credit',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
            reason: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: InvoiceSchema } }, description: 'Credit note created' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const runDunningRoute = createRoute({
  method: 'post',
  path: '/dunning/run',
  request: {},
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Dunning cycle started' },
  },
});

const getInvoiceItemsRoute = createRoute({
  method: 'get',
  path: '/invoices/{id}/items',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: z.array(InvoiceItemSchema) } }, description: 'Invoice items' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const getStatsRoute = createRoute({
  method: 'get',
  path: '/stats',
  request: {},
  responses: {
    200: { content: { 'application/json': { schema: StatsSchema } }, description: 'Billing statistics' },
  },
});

const getClientInvoicesRoute = createRoute({
  method: 'get',
  path: '/my-invoices',
  request: {
    query: z.object({
      status: z.enum(['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    }),
  },
  responses: {
    200: { content: { 'application/json': { schema: PaginatedInvoicesSchema } }, description: 'Client invoices' },
  },
});

export function billingRoutes(ctx: ModuleContext) {
  const app = new OpenAPIHono();

  app.openapi(
    { ...listInvoicesRoute, middleware: routePerm(ctx, SEED_PERM.invoicesView) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    const q = c.req.valid('query');
    const tenantId = c.get('tenantId') as string;
    const result = await billing.listInvoices(
      {
        status: q.status,
        search: q.search,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        clientId: q.clientId,
      },
      tenantId,
      q.limit,
      q.offset,
    );
    return c.json(result, 200);
  },
  );

  app.openapi(
    { ...getInvoiceRoute, middleware: routePerm(ctx, SEED_PERM.invoicesView, SEED_PERM.invoicesViewOwn) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    const { id } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    const result = await billing.getInvoice(id, tenantId);
    if (!result) return c.json({ error: 'Invoice not found' }, 404);
    return c.json(result, 200);
  },
  );

  app.openapi(
    { ...createInvoiceRoute, middleware: routePerm(ctx, SEED_PERM.invoicesCreate) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    const user = c.get('user') as Panel1AuthUser;
    const invoice = await billing.createInvoice(
      {
        clientId: body.clientId,
        subscriptionId: body.subscriptionId,
        items: body.items,
        tax: body.tax,
        dueDate: body.dueDate,
        currency: body.currency,
      },
      tenantId,
      user.id,
    );
    return c.json(invoice, 201);
  },
  );

  app.openapi(
    { ...updateInvoiceRoute, middleware: routePerm(ctx, SEED_PERM.invoicesEdit) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    try {
      const invoice = await billing.updateInvoice(id, body, tenantId);
      return c.json(invoice, 200);
    } catch {
      return c.json({ error: 'Invoice not found' }, 404);
    }
  },
  );

  app.openapi(
    { ...deleteInvoiceRoute, middleware: routePerm(ctx, SEED_PERM.invoicesDelete) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    const { id } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    try {
      await billing.deleteInvoice(id, tenantId);
      return c.json({ success: true }, 200);
    } catch {
      return c.json({ error: 'Invoice not found' }, 404);
    }
  },
  );

  app.openapi(
    { ...sendInvoiceRoute, middleware: routePerm(ctx, SEED_PERM.invoicesSend) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    const { id } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    try {
      await billing.sendInvoice(id, tenantId);
      return c.json({ success: true }, 200);
    } catch {
      return c.json({ error: 'Invoice not found' }, 404);
    }
  },
  );

  app.openapi(
    { ...markPaidRoute, middleware: routePerm(ctx, SEED_PERM.invoicesEdit) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    try {
      const invoice = await billing.markPaid(id, body.paymentId, body.amount, tenantId);
      return c.json(invoice, 200);
    } catch {
      return c.json({ error: 'Invoice not found' }, 404);
    }
  },
  );

  app.openapi(
    { ...getPdfRoute, middleware: routePerm(ctx, SEED_PERM.invoicesExport) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    const { id } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    try {
      const pdfBuffer = await billing.generatePdf(id, tenantId);
      return c.body(pdfBuffer, 200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${id}.pdf"`,
      });
    } catch {
      return c.json({ error: 'Invoice not found' }, 404);
    }
  },
  );

  app.openapi(
    { ...createCreditRoute, middleware: routePerm(ctx, SEED_PERM.invoicesEdit) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    try {
      const credit = await billing.createCredit(id, body.amount, body.reason, tenantId);
      return c.json(credit, 201);
    } catch {
      return c.json({ error: 'Invoice not found' }, 404);
    }
  },
  );

  app.openapi(
    { ...runDunningRoute, middleware: routePerm(ctx, SEED_PERM.dunningManage) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    void billing.runDunningCycle();
    return c.json({ success: true }, 200);
  },
  );

  app.openapi(
    { ...getInvoiceItemsRoute, middleware: routePerm(ctx, SEED_PERM.invoicesView, SEED_PERM.invoicesViewOwn) },
    async (c) => {
    const { id } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    const db = ctx.db as any;
    const { invoiceItems: ii } = await import('./schema.js');
    const { eq } = await import('drizzle-orm');
    const items = await db.select().from(ii).where(eq(ii.invoiceId, id));
    return c.json(items, 200);
  },
  );

  app.openapi(
    { ...getStatsRoute, middleware: routePerm(ctx, SEED_PERM.invoicesView) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    const tenantId = c.get('tenantId') as string;
    const stats = await billing.getStats(tenantId);
    return c.json(stats, 200);
  },
  );

  app.openapi(
    { ...getClientInvoicesRoute, middleware: routePerm(ctx, SEED_PERM.invoicesViewOwn, SEED_PERM.invoicesView) },
    async (c) => {
    const billing = ctx.service<IBillingService>('billing');
    const q = c.req.valid('query');
    const tenantId = c.get('tenantId') as string;
    const user = c.get('user') as Panel1AuthUser;
    const db = ctx.db as any;
    const { invoices: inv } = await import('./schema.js');
    const { eq, and, desc, count } = await import('drizzle-orm');

    const [clientRecord] = await db
      .select({ id: sql`id` })
      .from(sql`clients`)
      .where(and(
        eq(sql`clients.user_id`, user.id),
        eq(sql`clients.tenant_id`, tenantId),
      ))
      .limit(1);

    if (!clientRecord) {
      return c.json({ invoices: [], total: 0, hasMore: false }, 200);
    }

    const conditions: any[] = [
      eq(inv.clientId, (clientRecord as any).id),
      eq(inv.tenantId, tenantId),
    ];
    if (q.status) conditions.push(eq(inv.status, q.status));

    const rows = await db
      .select()
      .from(inv)
      .where(and(...conditions))
      .orderBy(desc(inv.createdAt))
      .limit(q.limit)
      .offset(q.offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(inv)
      .where(and(...conditions));

    return c.json({ invoices: rows, total, hasMore: q.offset + q.limit < total }, 200);
  },
  );

  return app;
}
