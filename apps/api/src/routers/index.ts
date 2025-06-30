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
import { permissionsRouter } from './permissions';
import { auditRouter } from './audit';
import { analyticsRouter } from './analytics';
import { paymentGatewaysRouter } from './payment-gateways';
import { healthRouter } from './health';
import { catalogRouter } from './catalog';
import { componentsRouter } from './components';
import { PluginManager } from '../lib/plugins/PluginManager';
import { permissionGroupsRouter } from './permissionGroups';

// Initialize plugin manager
const pluginManager = PluginManager.getInstance();
const plugins = pluginManager.getPlugins();

// Get plugin routers
const domainPlugin = plugins.get('domain-plugin');
const sslPlugin = plugins.get('ssl-plugin');

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
  domains: domainPlugin?.getRouter() || router({}),
  ssl: sslPlugin?.getRouter() || router({}),
  permissions: permissionsRouter,
  audit: auditRouter,
  analytics: analyticsRouter,
  paymentGateways: paymentGatewaysRouter,
  health: healthRouter,
  catalog: catalogRouter,
  components: componentsRouter,
  permissionGroups: permissionGroupsRouter,
});

export type AppRouter = typeof appRouter;