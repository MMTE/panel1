# Graph Report - panel1  (2026-09-06)

## Corpus Check
- 320 files · ~236,307 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2928 nodes · 4773 edges · 199 communities (125 shown, 62 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 92 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Billing Ledger
- API Trpc
- API Db
- Core Package
- WEB Lib
- WEB Components
- Core Package
- API Application
- API Db
- WEB Routes
- Project Configuration
- Package Configuration
- WEB Hooks
- API Hono
- API Db
- Support
- Billing
- Payments
- Support
- WEB Hooks
- WEB Hooks
- Payments
- Payments
- Project Configuration
- API Db
- Audit
- Catalog
- Provisioning
- Billing
- Payments
- Provisioning
- Subscriptions
- Support
- API Lib
- API Application
- Catalog
- Billing
- Types Package
- WEB Application
- WEB Application
- Billing
- Provisioning
- Support
- Core Package
- WEB Application
- Package Configuration
- Types Package
- API __Tests__
- WEB Application
- Provisioning Adapters
- WEB Application
- WEB Api
- Billing Ledger
- Support
- API Application
- API Lib
- WEB Components
- Core Package
- API Db
- Project Configuration
- Provisioning
- Subscriptions
- WEB Api
- WEB Lib
- WEB Lib
- Audit
- Provisioning
- Subscriptions
- Subscriptions
- Types Package
- API Lib
- WEB Components
- Architecture Documentation
- Billing
- API Lib
- Catalog
- Core Package
- API Lib
- WEB Lib
- Billing
- Catalog
- Payments
- Payments
- Provisioning
- Subscriptions
- Support
- Core Package
- WEB Pages
- Catalog
- Subscriptions
- Support
- Package Configuration
- Core Package
- API Lib
- Audit
- Audit
- Provisioning
- Subscriptions
- Package Configuration
- WEB Components
- Audit
- Core Package
- API Lib
- WEB Api
- WEB Lib
- Project Configuration
- Audit
- Support
- Core Package
- Core Package
- Core Package
- Types Package
- Project Configuration
- API Lib
- API Lib
- WEB Api
- WEB Lib
- WEB Lib
- WEB Pages
- Audit
- Package Configuration
- WEB Components
- Types Package
- API Application
- API Application
- WEB Application
- Project Configuration
- Core Package
- Core Package
- Types Package
- WEB Application
- WEB Pages
- WEB Pages
- Architecture Documentation
- API Lib
- API Lib
- Provisioning
- Types Package
- WEB Components
- WEB Pages
- Architecture Documentation
- Audit
- Package Configuration
- Project Configuration
- WEB Components
- Package Configuration
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API Application
- API __Tests__
- WEB Application
- WEB Application
- WEB Application
- WEB Application
- WEB Application
- WEB Api
- WEB Components
- Architecture Documentation
- Architecture Documentation
- Package Configuration
- Package Configuration
- Architecture Documentation
- Architecture Documentation
- Architecture Documentation
- Architecture Documentation
- Project Configuration

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 73 edges
2. `CatalogService` - 48 edges
3. `ModuleContext` - 45 edges
4. `trpc` - 32 edges
5. `ProvisioningService` - 32 edges
6. `PermissionManager` - 28 edges
7. `BillingService` - 28 edges
8. `PaymentService` - 26 edges
9. `SubscriptionService` - 24 edges
10. `ResourceType` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Catalog Runtime Shim` --semantically_similar_to--> `Service Registry`  [INFERRED] [semantically similar]
  docs/research/catalog-template.md → ARCHITECTURE.md
- `Transactional Postgres Outbox` --semantically_similar_to--> `Persistent Event Bus`  [INFERRED] [semantically similar]
  docs/plans/2026-07-12-panel1-implementation-plan.md → ARCHITECTURE.md
- `TestContext` --references--> `BootResult`  [EXTRACTED]
  apps/api/src/__tests__/integration/helpers.ts → packages/core/src/loader.ts
- `createTestContext()` --calls--> `bootModules()`  [EXTRACTED]
  apps/api/src/__tests__/integration/helpers.ts → packages/core/src/loader.ts
- `ContextVariableMap` --references--> `Panel1AuthUser`  [EXTRACTED]
  apps/api/src/hono/hono-context.d.ts → packages/core/src/middleware/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Module Boundary Pattern** — architecture_module_contract, architecture_module_context, architecture_service_registry, architecture_event_bus, architecture_filter_chain, architecture_schema_ownership, architecture_type_ownership [EXTRACTED 1.00]
- **Verified Money Core** — docs_plans_2026_07_12_panel1_implementation_plan_verified_money_core_rebuild, docs_plans_2026_07_12_panel1_implementation_plan_double_entry_ledger, docs_plans_2026_07_12_panel1_implementation_plan_transactional_outbox, docs_plans_2026_07_12_panel1_implementation_plan_single_tenant_first [EXTRACTED 1.00]
- **Catalog Module Migration Conventions** — docs_research_catalog_template_catalog_migration_template, docs_research_catalog_template_catalog_runtime_shim, architecture_module_contract, architecture_schema_ownership [EXTRACTED 1.00]
- **Core Module Platform** — docs_roadmap_packages_core, docs_roadmap_module_loader, docs_roadmap_event_bus, docs_roadmap_job_scheduler, docs_roadmap_host_infrastructure [EXTRACTED 1.00]
- **Revenue Path Module Migration** — docs_roadmap_catalog_module, docs_roadmap_billing_module, docs_roadmap_payments_module, docs_roadmap_subscriptions_module, docs_roadmap_provisioning_module [EXTRACTED 1.00]

## Communities (199 total, 62 thin omitted)

### Community 0 - "Billing Ledger"
Cohesion: 0.06
Nodes (47): ACCOUNTS_RECEIVABLE, ensureStandardAccounts(), EnsureStandardAccountsInput, REFUNDS, SALES_REVENUE, STANDARD_ACCOUNTS, STRIPE_CLEARING, TAX_PAYABLE (+39 more)

### Community 1 - "API Trpc"
Cohesion: 0.09
Nodes (44): client, db, __dirname, __filename, permissionGroupItems, permissionGroups, permissions, roleHierarchy (+36 more)

### Community 2 - "API Db"
Cohesion: 0.05
Nodes (44): Client, clients, clientsRelations, clientStatusEnum, NewClient, DunningAttempt, dunningAttempts, dunningAttemptsRelations (+36 more)

### Community 3 - "Core Package"
Cohesion: 0.08
Nodes (22): ContextDeps, createModuleContext(), createModuleLogger(), DbManager, DbManagerOptions, EventBusOptions, FilterChain, JobSchedulerOptions (+14 more)

### Community 4 - "WEB Lib"
Cohesion: 0.05
Nodes (12): auditApi, AuditEvent, AuditLogger, AuditTrailOptions, ExportOptions, getCurrentTenantId(), TODO: Implement proper tenant context for tRPC queries, NOTE: This is a temporary implementation. In production, this should use tRPC… (+4 more)

### Community 5 - "WEB Components"
Cohesion: 0.08
Nodes (31): RouterInputs, RouterOutputs, trpc, CreateClientModal(), CreateClientModalProps, FormData, initialFormData, CreateInvoiceModal() (+23 more)

### Community 6 - "Core Package"
Cohesion: 0.04
Nodes (46): dependencies, bullmq, drizzle-orm, hono, ioredis, node-cron, nodemailer, @panel1/types (+38 more)

### Community 7 - "API Application"
Cohesion: 0.04
Nodes (45): description, devDependencies, drizzle-kit, eslint, tsx, @types/bcryptjs, @types/cors, @types/express (+37 more)

### Community 8 - "API Db"
Cohesion: 0.06
Nodes (34): componentProviders, InvoiceCounter, invoiceCounters, invoiceCountersRelations, NewInvoiceCounter, gatewayStatusEnum, NewPaymentGatewayConfig, PaymentGatewayConfig (+26 more)

### Community 9 - "WEB Routes"
Cohesion: 0.07
Nodes (33): supportApi, SupportCategories(), SupportDashboard(), STATUS_OPTIONS, SupportTicketDetail(), SupportTickets(), CartPage(), CheckoutFormData (+25 more)

### Community 10 - "Project Configuration"
Cohesion: 0.06
Nodes (42): ^build, coverage/**, drizzle.config.ts, eslint.config.js, NODE_ENV, package.json, tsconfig.node.json, vitest.config.ts (+34 more)

### Community 11 - "Package Configuration"
Cohesion: 0.05
Nodes (39): @changesets/cli, @eslint/js, only-allow, devDependencies, autoprefixer, @changesets/cli, eslint, @eslint/js (+31 more)

### Community 12 - "WEB Hooks"
Cohesion: 0.08
Nodes (27): withPermission(), WithPermissionOptions, Can(), CanProps, Permission, PermissionsContext, PermissionsContextValue, Role (+19 more)

### Community 13 - "API Hono"
Cohesion: 0.13
Nodes (20): ContextVariableMap, hono, apiBearerAuthMiddleware, apiTenantMiddleware, resolveUserFromBearerToken(), getSessionByToken(), defineModule(), ContextVariableMap (+12 more)

### Community 14 - "API Db"
Cohesion: 0.06
Nodes (32): domains, NewProvisioningProvider, NewProvisioningTask, NewServiceInstance, operationTypeEnum, providerTypeEnum, ProvisioningProvider, provisioningProviders (+24 more)

### Community 15 - "Support"
Cohesion: 0.07
Nodes (31): setup(), addMessageRoute, assignTicketRoute, createAgentProfileRoute, createAutomationRuleRoute, createCategoryRoute, createSlaProfileRoute, createTicketRoute (+23 more)

### Community 16 - "Billing"
Cohesion: 0.06
Nodes (32): @electric-sql/pglite, dependencies, drizzle-orm, hono, @hono/zod-openapi, @panel1/core, @panel1/types, pdfkit (+24 more)

### Community 17 - "Payments"
Cohesion: 0.09
Nodes (29): gatewayStatusEnum, NewPayment, NewPaymentAttempt, NewPaymentGatewayConfig, Payment, PaymentAttempt, paymentAttempts, PaymentGatewayConfig (+21 more)

### Community 18 - "Support"
Cohesion: 0.10
Nodes (18): SupportAgentProfile, supportAgentProfiles, supportCategories, supportTicketCounters, SupportService, AddMessageInput, CreateTicketInput, EventMap (+10 more)

### Community 19 - "WEB Hooks"
Cohesion: 0.12
Nodes (20): AuthModal(), AuthModalProps, ClientHeader(), ClientHeaderProps, AuthContext, AuthContextType, AuthUser, rolePermissions (+12 more)

### Community 20 - "WEB Hooks"
Cohesion: 0.13
Nodes (21): InvoiceDetails(), InvoiceDetailsProps, PaymentModal(), PaymentModalProps, SubscriptionDetails(), SubscriptionDetailsProps, ClientSubscription, ComponentDefinition (+13 more)

### Community 21 - "Payments"
Cohesion: 0.06
Nodes (30): dependencies, drizzle-orm, hono, @hono/zod-openapi, @panel1/core, @panel1/types, stripe, zod (+22 more)

### Community 22 - "Payments"
Cohesion: 0.08
Nodes (27): setup(), capturePaymentRoute, CaptureResultSchema, ChargeResultSchema, createChargeRoute, createGatewayRoute, deleteGatewayRoute, ErrorSchema (+19 more)

### Community 23 - "Project Configuration"
Cohesion: 0.06
Nodes (30): ./packages/*/src, compilerOptions, allowImportingTsExtensions, allowJs, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules (+22 more)

### Community 24 - "API Db"
Cohesion: 0.07
Nodes (27): BillingPlan, billingPlans, billingPlansRelations, ComponentDefinition, componentDefinitionsRelations, ComponentProvider, componentRelations, components (+19 more)

### Community 25 - "Audit"
Cohesion: 0.07
Nodes (29): dependencies, drizzle-orm, hono, @hono/zod-openapi, @panel1/core, @panel1/types, zod, description (+21 more)

### Community 27 - "Provisioning"
Cohesion: 0.14
Nodes (5): ProvisioningService, CreateProviderInput, ProviderDTO, ProvisioningTaskDTO, ServiceInstanceDTO

### Community 28 - "Billing"
Cohesion: 0.11
Nodes (23): ledgerSchema, billingSchema, DunningAttempt, dunningAttempts, Invoice, InvoiceCounter, invoiceCounters, InvoiceItem (+15 more)

### Community 29 - "Payments"
Cohesion: 0.13
Nodes (4): PaymentService, StripeGatewayImpl, ChargeResult, GatewayDTO

### Community 30 - "Provisioning"
Cohesion: 0.07
Nodes (28): dependencies, drizzle-orm, hono, @hono/zod-openapi, @panel1/core, @panel1/types, zod, description (+20 more)

### Community 31 - "Subscriptions"
Cohesion: 0.07
Nodes (28): dependencies, drizzle-orm, hono, @hono/zod-openapi, @panel1/core, @panel1/types, zod, description (+20 more)

### Community 32 - "Support"
Cohesion: 0.07
Nodes (28): dependencies, drizzle-orm, hono, @hono/zod-openapi, @panel1/core, @panel1/types, zod, description (+20 more)

### Community 33 - "API Lib"
Cohesion: 0.11
Nodes (22): NewSession, NewUser, Session, sessions, sessionsRelations, User, userRoleEnum, users (+14 more)

### Community 34 - "API Application"
Cohesion: 0.07
Nodes (27): compilerOptions, allowImportingTsExtensions, baseUrl, declaration, declarationMap, esModuleInterop, isolatedModules, moduleResolution (+19 more)

### Community 35 - "Catalog"
Cohesion: 0.07
Nodes (26): dependencies, drizzle-orm, hono, @panel1/core, @panel1/types, zod, description, devDependencies (+18 more)

### Community 36 - "Billing"
Cohesion: 0.18
Nodes (5): setup(), BillingService, CreateInvoiceInput, InvoiceDTO, InvoiceWithItemsDTO

### Community 37 - "Types Package"
Cohesion: 0.15
Nodes (23): DateRange, Money, PaginatedResult, PaginationInput, SortOptions, SortOrder, CaptureResult, DomainAvailability (+15 more)

### Community 38 - "WEB Application"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleResolution (+16 more)

### Community 39 - "WEB Application"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, composite, declaration, declarationMap, emitDeclarationOnly, isolatedModules, lib (+16 more)

### Community 40 - "Billing"
Cohesion: 0.09
Nodes (22): billingRoutes(), createCreditRoute, createInvoiceRoute, deleteInvoiceRoute, ErrorSchema, getClientInvoicesRoute, getInvoiceItemsRoute, getInvoiceRoute (+14 more)

### Community 41 - "Provisioning"
Cohesion: 0.09
Nodes (22): createInstanceRoute, createProviderRoute, deleteInstanceRoute, deleteProviderRoute, ErrorSchema, getInstanceRoute, getProviderRoute, getTaskRoute (+14 more)

### Community 42 - "Support"
Cohesion: 0.11
Nodes (19): AutomationAction, AutomationCondition, KnowledgeBaseArticle, knowledgeBaseArticles, knowledgeBaseCategories, knowledgeBaseStatusEnum, messageTypeEnum, NewSupportTicket (+11 more)

### Community 43 - "Core Package"
Cohesion: 0.14
Nodes (17): AuthenticationError, AuthorizationError, ConflictError, DatabaseError, ExternalServiceError, generateCorrelationId(), InvoiceError, isPanel1Error() (+9 more)

### Community 44 - "WEB Application"
Cohesion: 0.09
Nodes (23): devDependencies, autoprefixer, eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh, postcss, tailwindcss, @types/react (+15 more)

### Community 45 - "Package Configuration"
Cohesion: 0.09
Nodes (23): @cpanel/api, dependencies, @cpanel/api, dotenv, drizzle-kit, lucide-react, react, react-router-dom (+15 more)

### Community 46 - "Types Package"
Cohesion: 0.11
Nodes (11): FilterEntry, EventHandler, EventMap, FilterHandler, Logger, ModuleUI, NavItem, PageRegistration (+3 more)

### Community 47 - "API __Tests__"
Cohesion: 0.19
Nodes (17): auditModuleTablesExist(), createTestContext(), deleteSeedData(), ensureDir(), executeOptionalDelete(), integrationEnabled(), rmDir(), seedTestData() (+9 more)

### Community 48 - "WEB Application"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+13 more)

### Community 49 - "Provisioning Adapters"
Cohesion: 0.19
Nodes (8): CpanelAdapter, CreateServiceInstanceInput, EventMap, HealthCheckResult, @panel1/types, ProvisioningConfig, ProvisioningResult, ServiceParameters

### Community 50 - "WEB Application"
Cohesion: 0.10
Nodes (21): dependencies, @heroicons/react, i18next, lucide-react, react, react-dom, react-hot-toast, react-i18next (+13 more)

### Community 51 - "WEB Api"
Cohesion: 0.15
Nodes (18): AuditExportListItem, AuditExportStatus, AuditFilterOptions, AuditLogRow, AuditLogsResult, AuditStats, base(), base() (+10 more)

### Community 52 - "Billing Ledger"
Cohesion: 0.10
Nodes (20): LedgerAccount, ledgerAccounts, ledgerAccountTypeEnum, ledgerEntries, LedgerEntry, ledgerEntryDirectionEnum, ledgerSourceTypeEnum, LedgerTransaction (+12 more)

### Community 53 - "Support"
Cohesion: 0.12
Nodes (4): SupportSlaProfile, minutesSince(), SlaManager, ModuleContext

### Community 54 - "API Application"
Cohesion: 0.14
Nodes (16): getDatabaseUrl(), getRedisOptions(), modules, eventOutbox, EventOutboxRow, NewEventOutboxRow, apiRequirePermission, app (+8 more)

### Community 56 - "WEB Components"
Cohesion: 0.12
Nodes (13): queryClient, trpcClient, App(), AdminRoute(), AdminRouteProps, DevBottomBar(), FALLBACK_PROFILES, NOTE: This component is for development only and uses RBAC system for… (+5 more)

### Community 57 - "Core Package"
Cohesion: 0.15
Nodes (5): EventBus, EventBusBullmqOptions, EventOutboxPort, HandlerEntry, JobPayload

### Community 58 - "API Db"
Cohesion: 0.11
Nodes (18): DnsRecord, dnsRecords, dnsRecordsRelations, dnsRecordTypeEnum, DnsZone, dnsZones, dnsZonesRelations, Domain (+10 more)

### Community 59 - "Project Configuration"
Cohesion: 0.11
Nodes (19): Dynamic Web Shell, Persistent Event Bus, Extension Interfaces, Synchronous Filter Chain, Microservice Extraction Path, ModuleContext, Module Contract, Service Registry (+11 more)

### Community 60 - "Provisioning"
Cohesion: 0.15
Nodes (16): setup(), provisioningRoutes(), routePerm(), NewProvisioningProvider, NewProvisioningTask, NewServiceInstance, operationTypeEnum, providerTypeEnum (+8 more)

### Community 61 - "Subscriptions"
Cohesion: 0.11
Nodes (17): CancelResultSchema, cancelSubscriptionRoute, changePlanRoute, createSubscriptionRoute, ErrorSchema, getMySubscriptionsRoute, getProrationRoute, getStateChangesRoute (+9 more)

### Community 62 - "WEB Api"
Cohesion: 0.17
Nodes (10): base(), catalogApi, LegacyPlanRow, fetchJsonPublic(), CatalogDashboard(), ComponentDetailsProps, ComponentForm(), ComponentFormProps (+2 more)

### Community 63 - "WEB Lib"
Cohesion: 0.12
Nodes (8): AuthProvider(), emitEvent(), Event, EventEmitter, EventHistoryOptions, EventMetadata, TODO: Implement persistent event storage with tRPC + Drizzle, WebhookConfig

### Community 64 - "WEB Lib"
Cohesion: 0.11
Nodes (18): ResourceType, ANALYTICS, AUDIT_LOG, CLIENT, DOMAIN, INVOICE, KNOWLEDGE_BASE, PAYMENT (+10 more)

### Community 65 - "Audit"
Cohesion: 0.12
Nodes (15): AuditLogSchema, auditRoutes(), cleanupRoute, createExportRoute, downloadExportRoute, getExportStatusRoute, getFilterOptionsRoute, getStatsRoute (+7 more)

### Community 67 - "Subscriptions"
Cohesion: 0.30
Nodes (3): setup(), SubscriptionService, SubscriptionDTO

### Community 68 - "Subscriptions"
Cohesion: 0.17
Nodes (13): subscriptionComponents, subscriptionStateChanges, CancelSubscriptionInput, CreateSubscriptionInput, EventMap, PaginatedSubscriptions, @panel1/types, ProrationResult (+5 more)

### Community 69 - "Types Package"
Cohesion: 0.11
Nodes (17): description, devDependencies, typescript, zod, exports, typescript, zod, main (+9 more)

### Community 70 - "API Lib"
Cohesion: 0.12
Nodes (17): ResourceType, ANALYTICS, AUDIT_LOG, CLIENT, COMPONENT, DOMAIN, INVOICE, PAYMENT (+9 more)

### Community 71 - "WEB Components"
Cohesion: 0.16
Nodes (13): AdminSidebar(), AdminSidebarProps, defaultNavigation, MenuItem, Can(), CanProps, usePermissions(), ClientNavigation() (+5 more)

### Community 72 - "Architecture Documentation"
Cohesion: 0.13
Nodes (17): Audit Module, Billing Module, BullMQ-backed Event Bus, Hono-only HTTP Server, Host Infrastructure Services, BullMQ-backed Job Scheduler, Legacy Event and Job Bridge, Module Context (+9 more)

### Community 74 - "API Lib"
Cohesion: 0.12
Nodes (16): PermissionAction, APPROVE, ASSIGN, CANCEL, CREATE, DELETE, EXECUTE, LIST (+8 more)

### Community 75 - "Catalog"
Cohesion: 0.17
Nodes (14): Db, RegistryProvider, billingIntervalLegacyEnum, billingPlans, billingPlansRelations, componentProviders, components, componentsRelations (+6 more)

### Community 76 - "Core Package"
Cohesion: 0.17
Nodes (5): ExecutionMetrics, JobData, JobEntry, JobScheduler, ModuleJobOptions

### Community 77 - "API Lib"
Cohesion: 0.19
Nodes (9): AuthUser, AuthRateLimiter, Bucket, DEFAULT_AUTH_RATE_LIMIT, getClientIp(), RateLimitConfig, RateLimitResult, Context (+1 more)

### Community 78 - "WEB Lib"
Cohesion: 0.13
Nodes (14): BatchPermissionCheckResult, Permission, PermissionCheckResult, PermissionCondition, PermissionGroup, PermissionRequest, PermissionUpdateOptions, RoleAssignmentOptions (+6 more)

### Community 79 - "Billing"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, paths, exclude, extends, include, dist, node_modules (+6 more)

### Community 80 - "Catalog"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, paths, exclude, extends, include, dist, node_modules (+6 more)

### Community 82 - "Payments"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, paths, exclude, extends, include, dist, node_modules (+6 more)

### Community 83 - "Provisioning"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, paths, exclude, extends, include, dist, node_modules (+6 more)

### Community 84 - "Subscriptions"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, paths, exclude, extends, include, dist, node_modules (+6 more)

### Community 85 - "Support"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, paths, exclude, extends, include, dist, node_modules (+6 more)

### Community 86 - "Core Package"
Cohesion: 0.17
Nodes (5): createEmailService(), EmailConfig, EmailMessage, EmailService, EmailTemplate

### Community 87 - "WEB Pages"
Cohesion: 0.21
Nodes (9): ComponentDefinition, DynamicConfigForm(), DynamicConfigFormProps, BillingPlan, ComponentConfig, ProductBuilder(), ProductFormData, ProductPreview() (+1 more)

### Community 88 - "Catalog"
Cohesion: 0.22
Nodes (10): requireAdmin(), setup(), catalogRoutes(), jsonError(), listPublicQuery, routePerm(), catalogSchema, SEED_PERM (+2 more)

### Community 90 - "Support"
Cohesion: 0.36
Nodes (3): SupportAutomationEngine, SupportTicket, TicketMessage

### Community 91 - "Package Configuration"
Cohesion: 0.14
Nodes (13): author, bugs, url, description, engines, node, homepage, license (+5 more)

### Community 93 - "API Lib"
Cohesion: 0.15
Nodes (11): Role, ADMIN, AGENT, BILLING_AGENT, CLIENT, CLIENT_USER, MANAGER, RESELLER (+3 more)

### Community 94 - "Audit"
Cohesion: 0.24
Nodes (7): auditLogExports, auditLogRetentionPolicies, auditLogs, auditSchema, escapeCsvCell(), logsToCsv(), AuditExportRequest

### Community 95 - "Audit"
Cohesion: 0.15
Nodes (8): AuditEvent, AuditExportDetail, AuditExportListItem, AuditFilterOptions, AuditLogEntry, AuditStats, EventMap, @panel1/types

### Community 98 - "Subscriptions"
Cohesion: 0.18
Nodes (11): routePerm(), subscriptionRoutes(), NewSubscription, NewSubscriptionComponent, NewSubscriptionStateChange, Subscription, SubscriptionComponent, subscriptions (+3 more)

### Community 99 - "Package Configuration"
Cohesion: 0.15
Nodes (13): scripts, build, changeset, db:generate, db:migrate, db:studio, dev, dev:api (+5 more)

### Community 100 - "WEB Components"
Cohesion: 0.26
Nodes (7): AdminHeader(), AdminHeaderProps, LanguageSelector(), LanguageSelectorProps, TenantBranding(), useTenant(), AdminLayout()

### Community 103 - "API Lib"
Cohesion: 0.18
Nodes (9): AddMessageParams, AuthUser, AutomationAction, AutomationCondition, CreateSubscriptionParams, CreateTicketParams, EventPayload, ResourceContext (+1 more)

### Community 104 - "WEB Api"
Cohesion: 0.20
Nodes (9): base(), CaptureResult, ChargeResult, GatewayRow, HealthCheckResult, PaginatedPayments, PaymentRow, paymentsApi (+1 more)

### Community 105 - "WEB Lib"
Cohesion: 0.20
Nodes (10): PermissionAction, APPROVE, CREATE, DELETE, EXECUTE, MANAGE, READ, UPDATE (+2 more)

### Community 106 - "Project Configuration"
Cohesion: 0.20
Nodes (9): access, baseBranch, changelog, commit, fixed, ignore, linked, $schema (+1 more)

### Community 107 - "Audit"
Cohesion: 0.20
Nodes (9): compilerOptions, noEmit, exclude, extends, include, dist, node_modules, src/**/* (+1 more)

### Community 110 - "Core Package"
Cohesion: 0.33
Nodes (7): add(), EXPONENT, fromMinor(), getExponent(), ParsedDecimal, sub(), unknownCurrencyError

### Community 111 - "Core Package"
Cohesion: 0.20
Nodes (9): compilerOptions, noEmit, exclude, extends, include, dist, node_modules, src/**/* (+1 more)

### Community 112 - "Types Package"
Cohesion: 0.20
Nodes (9): compilerOptions, noEmit, exclude, extends, include, dist, node_modules, src/**/* (+1 more)

### Community 113 - "Project Configuration"
Cohesion: 0.20
Nodes (9): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, strict, include (+1 more)

### Community 115 - "API Lib"
Cohesion: 0.50
Nodes (7): buildConnectSrc(), buildScriptSrc(), isDevelopment(), isOriginAllowed(), makeCorsOriginVerifier(), OriginPolicyInput, parseCorsOriginList()

### Community 116 - "WEB Api"
Cohesion: 0.22
Nodes (8): base(), PaginatedTickets, SlaMetrics, SupportCategoryRow, SupportMessageRow, SupportStats, SupportTicketRow, TicketWithMessages

### Community 117 - "WEB Lib"
Cohesion: 0.22
Nodes (9): Role, ADMIN, BILLING_AGENT, CLIENT, CLIENT_USER, MANAGER, RESELLER, SUPER_ADMIN (+1 more)

### Community 118 - "WEB Lib"
Cohesion: 0.22
Nodes (3): ProrationCalculation, ProrationCalculator, ProrationItem

### Community 119 - "WEB Pages"
Cohesion: 0.25
Nodes (7): AdminPlugins(), formatDate(), InstalledPluginsTab(), InstalledPluginsTabProps, marketplaceManager, MarketplacePlugin, MarketplaceTabProps

### Community 120 - "Audit"
Cohesion: 0.31
Nodes (3): setup(), AuditService, AuditExportsResult

### Community 121 - "Package Configuration"
Cohesion: 0.22
Nodes (9): keywords, billing, drizzle, hosting, open-source, provisioning, saas, trpc (+1 more)

### Community 122 - "WEB Components"
Cohesion: 0.25
Nodes (3): ErrorBoundary, Props, State

### Community 124 - "API Application"
Cohesion: 0.29
Nodes (7): dependencies, bcryptjs, drizzle-orm, @panel1/mod-catalog, drizzle-orm, bcryptjs, @panel1/mod-catalog

### Community 125 - "API Application"
Cohesion: 0.29
Nodes (6): extends, ./tsconfig.json, ts-node, esm, experimentalSpecifierResolution, transpileOnly

### Community 126 - "WEB Application"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, preview, test, type-check

### Community 127 - "Project Configuration"
Cohesion: 0.29
Nodes (7): Per-Module Schema Ownership, Panel1 Target Architecture, Module-Owned Public Types, Vertical-Slice Modules, Boot Flow Audit, Legacy Bridge, Migration Surface Audit

### Community 128 - "Core Package"
Cohesion: 0.29
Nodes (6): LogContext, LogLevel, DEBUG, ERROR, INFO, WARN

### Community 129 - "Core Package"
Cohesion: 0.29
Nodes (6): CircuitBreakerConfig, CircuitState, CLOSED, HALF_OPEN, OPEN, RetryConfig

### Community 131 - "WEB Application"
Cohesion: 0.33
Nodes (5): description, name, private, type, version

### Community 132 - "WEB Pages"
Cohesion: 0.40
Nodes (4): ComponentRegistrationManagement(), ComponentRegistrationData, ComponentRegistrationForm(), ComponentRegistrationFormProps

### Community 133 - "WEB Pages"
Cohesion: 0.33
Nodes (3): ComponentHealthMonitorProps, HealthData, HealthStatus

### Community 134 - "Architecture Documentation"
Cohesion: 0.33
Nodes (6): Panel1 Migration Roadmap, Modular Monolith, Module Integration Test Suite, Vertical-Slice Module, pnpm Build Allowlist, pnpm Workspace Topology

### Community 135 - "API Lib"
Cohesion: 0.70
Nodes (4): createErrorHandlingMiddleware(), handleError(), mapStatusCodeToTRPCCode(), withErrorHandling()

### Community 136 - "API Lib"
Cohesion: 0.50
Nodes (4): ACTION_SUFFIX, MODULE_TO_RESOURCE, parseCanonicalPermission(), seedModulePermissionsFromDefinitions()

### Community 141 - "Architecture Documentation"
Cohesion: 0.50
Nodes (4): Cross-Module Foreign Key Reference Map, Domains Module, Per-Module Database Schema Ownership, SSL Module

### Community 143 - "Package Configuration"
Cohesion: 0.50
Nodes (4): apps/*, modules/*, packages/*, workspaces

### Community 144 - "Project Configuration"
Cohesion: 0.67
Nodes (3): Panel1 Development Conventions, Contribution Workflow, Continuous Integration

### Community 146 - "Package Configuration"
Cohesion: 0.67
Nodes (3): repository, type, url

## Knowledge Gaps
- **1212 isolated node(s):** `$schema`, `changelog`, `commit`, `fixed`, `linked` (+1207 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1533 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **62 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppRouter` connect `API Application` to `API Trpc`, `WEB Components`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `ModuleContext` connect `Support` to `Core Package`, `Support`, `Payments`, `Support`, `Payments`, `Provisioning`, `Billing`, `Payments`, `Billing`, `Types Package`, `Billing`, `Provisioning`, `Support`, `Types Package`, `Provisioning`, `Subscriptions`, `Audit`, `Subscriptions`, `Subscriptions`, `Catalog`, `Catalog`, `Support`, `Audit`, `Audit`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `Logger` connect `Core Package` to `Core Package`, `API Trpc`, `Core Package`, `Core Package`, `API Lib`, `API Lib`, `API Hono`, `API Lib`, `API Application`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `$schema`, `changelog`, `commit` to the rest of the system?**
  _1212 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Billing Ledger` be split into smaller, more focused modules?**
  _Cohesion score 0.061343204653622425 - nodes in this community are weakly interconnected._
- **Should `API Trpc` be split into smaller, more focused modules?**
  _Cohesion score 0.09117475160724722 - nodes in this community are weakly interconnected._
- **Should `API Db` be split into smaller, more focused modules?**
  _Cohesion score 0.05241090146750524 - nodes in this community are weakly interconnected._