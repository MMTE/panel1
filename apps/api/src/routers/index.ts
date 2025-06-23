import { router } from '../trpc/trpc.js';
import { authRouter } from './auth.js';
import { usersRouter } from './users.js';
import { plansRouter } from './plans.js';
import { clientsRouter } from './clients.js';
import { invoicesRouter } from './invoices.js';
import { tenantsRouter } from './tenants.js';

export const appRouter = router({
  auth: authRouter,
  users: usersRouter,
  plans: plansRouter,
  clients: clientsRouter,
  invoices: invoicesRouter,
  tenants: tenantsRouter,
});

export type AppRouter = typeof appRouter;