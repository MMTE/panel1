import { router } from '../trpc/trpc';
import { authRouter } from './auth';
import { usersRouter } from './users';
import { clientsRouter } from './clients';
import { tenantsRouter } from './tenants';

import { dashboardRouter } from './dashboard';
import { permissionsRouter } from './permissions';
import { analyticsRouter } from './analytics';
import { permissionGroupsRouter } from './permissionGroups';

export const appRouter = router({
  auth: authRouter,
  users: usersRouter,
  clients: clientsRouter,
  tenants: tenantsRouter,

  dashboard: dashboardRouter,
  permissions: permissionsRouter,
  analytics: analyticsRouter,
  permissionGroups: permissionGroupsRouter,
});

export type AppRouter = typeof appRouter;
