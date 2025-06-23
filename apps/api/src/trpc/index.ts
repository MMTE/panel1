import { router } from './trpc.js';
import { appRouter } from '../routers/index.js';

export { appRouter };
export { createContext } from './context.js';
export type { AppRouter } from '../routers/index.js';