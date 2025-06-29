import { router } from '../trpc/trpc';
import { authRouter } from './auth';
import { usersRouter } from './users';
import { plansRouter } from './plans';
import { clientsRouter } from './clients';
import { invoicesRouter } from './invoices';
import { tenantsRouter } from './tenants';
import { subscriptionsRouter } from './subscriptions';
import { provisioningRouter } from './provisioning';
import { supportRouter } from './support';
import { dashboardRouter } from './dashboard';
import { domainsRouter } from './domains';
import { sslRouter } from './ssl';
import { permissionsRouter } from './permissions';
import { auditRouter } from './audit';
import { analyticsRouter } from './analytics';
import { paymentGatewaysRouter } from './payment-gateways';

export const appRouter = router({
  auth: authRouter,
  users: usersRouter,
  plans: plansRouter,
  clients: clientsRouter,
  invoices: invoicesRouter,
  tenants: tenantsRouter,
  subscriptions: subscriptionsRouter,
  provisioning: provisioningRouter,
  support: supportRouter,
  dashboard: dashboardRouter,
  domains: domainsRouter,
  ssl: sslRouter,
  permissions: permissionsRouter,
  audit: auditRouter,
  analytics: analyticsRouter,
  paymentGateways: paymentGatewaysRouter,
});

export type AppRouter = typeof appRouter;