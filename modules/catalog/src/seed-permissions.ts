/** Canonical RBAC ids — aligned with `apps/api` `seed-rbac-data.ts`. */
export const SEED_PERM = {
  plansView: 'catalog.plans.view',
  plansCreate: 'catalog.plans.create',
  plansEdit: 'catalog.plans.edit',
  plansDelete: 'catalog.plans.delete',
  dashboardView: 'catalog.dashboard.view',
  productsManage: 'catalog.products.manage',
  productsCreate: 'catalog.products.create',
  productsEdit: 'catalog.products.edit',
  componentsManage: 'catalog.components.manage',
} as const;
