import { router } from './trpc.js';

// Import routers
import { authRouter } from '../modules/auth/auth.router.js';
import { userRouter } from '../modules/auth/user.router.js';
import { billingRouter } from '../modules/billing/billing.router.js';
import { clientRouter } from '../modules/clients/client.router.js';

// Main app router
export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  billing: billingRouter,
  client: clientRouter,
});

export type AppRouter = typeof appRouter;