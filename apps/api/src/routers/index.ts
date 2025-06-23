import { router } from '../trpc/trpc';
import { authRouter } from './auth';
import { usersRouter } from './users';
import { plansRouter } from './plans';
import { clientsRouter } from './clients';
import { invoicesRouter } from './invoices';
import { tenantsRouter } from './tenants';

export const appRouter = router({
  auth: authRouter,
  users: usersRouter,
  plans: plansRouter,
  clients: clientsRouter,
  invoices: invoicesRouter,
  tenants: tenantsRouter,
});

export type AppRouter = typeof appRouter;