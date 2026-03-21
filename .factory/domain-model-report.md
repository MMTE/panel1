# Panel1 Complete Domain Model Report

## 1. Complete Database Table Inventory (Grouped by Domain)

### 🏢 CORE / MULTI-TENANCY (4 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `tenants` | id, name, slug, domain, settings, branding, isActive | — |
| `users` | id, email, password, firstName, lastName, role (enum), isActive, tenantId | → tenants |
| `sessions` | id, userId, token, expiresAt | → users |
| `clients` | id, userId, companyName, address, city, state, zipCode, country, phone, status (enum), tenantId | → users, → tenants |

### 🔐 RBAC / AUTH (6 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `roles` | id, name, description, isSystem, metadata | — |
| `permissions` | id, name, resource, action, description, conditions | — |
| `role_permissions` | roleId, permissionId, grantedAt, grantedBy, conditions | → roles, → permissions |
| `role_hierarchy` | parentRole, childRole, metadata | → roles, → roles |
| `user_roles` | userId, roleId, tenantId, assignedAt, assignedBy, expiresAt | → users, → roles, → tenants |
| `permission_groups` | id, name, description | — |
| `permission_group_items` | groupId, permissionId | → permission_groups, → permissions |

### 📦 CATALOG / PRODUCTS (6 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `components` | id, name, componentKey, type (enum), provider, features, configuration, metadata, tenantId | → tenants |
| `component_providers` | componentKey (PK), name, version, description, metadata | — |
| `products` | id, name, description, isActive, sortOrder, tenantId | → tenants |
| `product_components` | id, productId, componentId, pricingModel, pricingDetails, configuration, tenantId | → products, → components, → tenants |
| `billing_plans` | id, name, productId, interval, intervalCount, price, currency, trialPeriodDays, isDefault, tenantId | → products, → tenants |
| `plan_components` | id, planId, componentId, pricingModel, configuration, limits, pricing | → billing_plans, → components |

### 📋 SUBSCRIPTIONS (4 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `subscriptions` | id, clientId, planId, planName, currency, status (enum), currentPeriodStart/End, nextBillingDate, cancelAtPeriodEnd, trialStart/End, failedPaymentAttempts, paymentMethodId, tenantId | → clients, → plans, → tenants |
| `subscription_components` | id, subscriptionId, componentId, name, quantity, unitPrice, provisioningStatus | → subscriptions |
| `subscribed_components` | id, subscriptionId, componentId, productComponentId, quantity, currentUsage, usageLimit, isActive, tenantId | → subscriptions, → components, → product_components, → tenants |
| `subscription_state_changes` | id, subscriptionId, fromStatus, toStatus, reason, metadata, userId, tenantId | → subscriptions, → users, → tenants |

### 💰 INVOICING (3 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `invoices` | id, clientId, userId, subscriptionId, invoiceNumber, status (enum), subtotal, tax, total, currency, dueDate, paidAt, invoiceType, parentInvoiceId, tenantId | → clients, → users, → subscriptions, → tenants |
| `invoice_items` | id, invoiceId, description, quantity, unitPrice, total | → invoices |
| `invoice_counters` | id, tenantId, year, lastNumber, prefix, suffix | → tenants |

### 💳 PAYMENTS (3 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `payments` | id, tenantId, clientId, invoiceId, subscriptionId, amount, currency, status (enum), gateway, gatewayId, gatewayPaymentId, gatewayResponse, refundedAmount, refundStatus, failureReason, retryCount, nextRetryAt | → tenants, → clients, → invoices, → subscriptions |
| `payment_attempts` | id, paymentId, gatewayName, attemptNumber, status, processingTimeMs, errorMessage, gatewayResponse | → payments |
| `payment_gateway_configs` | id, gatewayName, displayName, status (enum), isActive, isDefault, config (encrypted), supportedCurrencies, webhookUrl, tenantId | → tenants |

### 📧 DUNNING (1 table)
| Table | Key Columns | FK References |
|---|---|---|
| `dunning_attempts` | id, subscriptionId, campaignType, attemptNumber, status, scheduledAt, executedAt, nextAttemptAt, metadata, tenantId | → subscriptions, → tenants |

### 🖥️ PROVISIONING (3 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `provisioning_providers` | id, name, type (enum: cpanel/plesk/docker/k8s/whm/directadmin/custom), hostname, port, apiKey (encrypted), apiSecret (encrypted), config, limits, healthStatus, tenantId | → tenants |
| `service_instances` | id, subscriptionId, providerId, serviceName, serviceType, remoteId, remoteData, controlPanelUrl, username, password (encrypted), diskQuota, bandwidthQuota, status, tenantId | → subscriptions, → provisioning_providers, → tenants |
| `provisioning_tasks` | id, serviceInstanceId, providerId, operation (enum), status (enum), requestData, responseData, startedAt, completedAt, attemptNumber, jobId, tenantId | → service_instances, → provisioning_providers, → tenants |

### 🌐 DOMAINS (4 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `domains` | id, domainName, clientId, subscriptionId, registrar, status (enum), nameservers, registrantContact, autoRenew, expiresAt, privacyEnabled, authCode, tenantId | → clients, → subscriptions, → tenants |
| `dns_zones` | id, domainId, zoneName, soaRecord, isActive, tenantId | → domains, → tenants |
| `dns_records` | id, zoneId, name, type (enum), value, ttl, priority, tenantId | → dns_zones, → tenants |
| `domain_operations` | id, domainId, operation (enum), status, requestData, responseData, errorMessage, tenantId | → domains, → tenants |

### 🔒 SSL CERTIFICATES (3 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `ssl_certificates` | id, certificateName, type (enum), provider (enum), primaryDomain, clientId, domainId, serviceInstanceId, certificate, privateKey, status (enum), autoRenew, cost, tenantId | → clients, → domains, → service_instances, → tenants |
| `ssl_certificate_operations` | id, certificateId, operation (enum), status, requestData, responseData, tenantId | → ssl_certificates, → tenants |
| `ssl_validation_records` | id, certificateId, domain, method, recordName, recordValue, isValidated, tenantId | → ssl_certificates, → tenants |

### 🎫 SUPPORT (8 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `support_categories` | id, name, description, parentCategoryId, defaultAssigneeId, autoAssignmentRules, tenantId | self-referencing, → users, → tenants |
| `support_tickets` | id, ticketNumber, subject, status (enum), priority (enum), clientId, categoryId, assignedToId, createdById, tags, firstResponseDue, resolutionDue, satisfactionRating, tenantId | → clients, → support_categories, → users (×2), → tenants |
| `ticket_messages` | id, ticketId, content, htmlContent, messageType (enum), authorId, isInternal, attachments, timeSpent, tenantId | → support_tickets, → users, → tenants |
| `knowledge_base_categories` | id, name, description, parentCategoryId, isPublic, tenantId | self-referencing, → tenants |
| `knowledge_base_articles` | id, title, slug, content, status (enum), categoryId, tags, viewCount, authorId, lastEditedById, tenantId | → knowledge_base_categories, → users (×2), → tenants |
| `support_automation_rules` | id, name, triggerEvent, conditions, actions, priority, tenantId | → tenants |
| `support_sla_profiles` | id, name, firstResponseTime, resolutionTime, businessHours, escalationRules, tenantId | → tenants |
| `support_agent_profiles` | id, userId, isActive, maxTickets, currentTickets, categories, skills, languages, workingHours, satisfactionScore, tenantId | → users, → tenants |

### 📋 AUDIT (3 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `audit_logs` | id, actionType, resourceType, resourceId, userId, tenantId, ipAddress, userAgent, oldValues, newValues, metadata | → users, → tenants |
| `audit_log_retention_policies` | id, tenantId, resourceType, retentionDays, archiveAfterDays, immutable | → tenants |
| `audit_log_exports` | id, tenantId, requestedBy, startDate, endDate, format, status, fileUrl | → tenants, → users |

### ⏰ JOBS (1 table)
| Table | Key Columns | FK References |
|---|---|---|
| `scheduled_jobs` | id, jobType, queueName, payload, status, scheduledAt, startedAt, completedAt, attemptNumber, maxAttempts, tenantId | → tenants |

### 🔌 PLUGINS (4 tables)
| Table | Key Columns | FK References |
|---|---|---|
| `plugins` | id, name, version, description, author, status, installedAt, tenantId | → tenants |
| `plugin_configs` | id, pluginId, tenantId, config | → plugins, → tenants |
| `plugin_hooks` | id, pluginId, event, priority, handler | → plugins |
| `plugin_extension_points` | id, pluginId, description, schema, defaultConfig | → plugins |

**Total: ~53 tables across 12 domain groups**

---

## 2. All FK Relationships (Cross-Domain References)

### Central Hub: `tenants`
Almost every table references `tenants.id` — it's the universal scoping mechanism (multi-tenancy).

### Central Hub: `users`
Referenced by: clients, sessions, invoices, subscription_state_changes, support_tickets (×2), ticket_messages, knowledge_base_articles (×2), audit_logs, user_roles, support_agent_profiles, support_categories, audit_log_exports

### Cross-Domain FK Map:
```
clients → users, tenants
subscriptions → clients, plans, tenants
invoices → clients, users, subscriptions, tenants
payments → tenants, clients, invoices, subscriptions
dunning_attempts → subscriptions, tenants
service_instances → subscriptions, provisioning_providers, tenants
domains → clients, subscriptions, tenants
ssl_certificates → clients, domains, service_instances, tenants
support_tickets → clients, users, support_categories, tenants
subscribed_components → subscriptions, components, product_components, tenants
subscription_state_changes → subscriptions, users, tenants
audit_logs → users, tenants
```

### Key Cross-Domain Couplings:
1. **Subscriptions ↔ Billing**: subscriptions→plans, invoices→subscriptions, payments→invoices+subscriptions
2. **Subscriptions ↔ Provisioning**: service_instances→subscriptions
3. **Subscriptions ↔ Catalog**: subscribed_components→subscriptions+components+product_components
4. **Subscriptions ↔ Domains**: domains→subscriptions
5. **Domains ↔ SSL**: ssl_certificates→domains
6. **SSL ↔ Provisioning**: ssl_certificates→service_instances
7. **Support ↔ Clients**: support_tickets→clients
8. **Dunning ↔ Subscriptions**: dunning_attempts→subscriptions

---

## 3. All Services and What Domains They Touch

| Service | Location | Domains Touched |
|---|---|---|
| **auth.ts** | `lib/auth.ts` | Users, Sessions, Permissions |
| **PermissionManager** | `lib/auth/PermissionManager.ts` | Roles, Permissions, Role-Hierarchy, Permission-Groups |
| **SubscriptionService** | `lib/subscription/SubscriptionService.ts` | Subscriptions, Plans, Invoices, Payments, SubscribedComponents, Products, ProductComponents, Tenants, Clients, SubscriptionStateChanges |
| **DunningManager** | `lib/subscription/DunningManager.ts` | Subscriptions, DunningAttempts, Clients, Users |
| **PaymentService** | `lib/payments/PaymentService.ts` | Payments, PaymentGatewayConfigs |
| **PaymentGatewayService** | `lib/payments/PaymentGatewayService.ts` | PaymentGatewayConfigs |
| **PaymentEventHandler** | `lib/payments/PaymentEventHandler.ts` | Invoices, Subscriptions, Plans (event-driven) |
| **InvoiceNumberService** | `lib/invoice/InvoiceNumberService.ts` | InvoiceCounters |
| **ComponentInvoiceService** | `lib/invoice/ComponentInvoiceService.ts` | Subscriptions, SubscriptionComponents, Invoices, InvoiceItems |
| **InvoiceEventHandler** | `lib/invoice/InvoiceEventHandler.ts` | Invoices, Clients, Users, Tenants (email triggers) |
| **InvoiceEmailService** | `lib/invoice/InvoiceEmailService.ts` | (Email sending - no direct DB) |
| **InvoicePDFService** | `lib/invoice/InvoicePDFService.ts` | (PDF generation) |
| **TaxCalculationService** | `lib/invoice/TaxCalculationService.ts` | (Tax calculation logic) |
| **ProvisioningManager** | `lib/provisioning/ProvisioningManager.ts` | ProvisioningProviders, ServiceInstances, ProvisioningTasks, ScheduledJobs |
| **CpanelPlugin** | `lib/provisioning/plugins/CpanelPlugin.ts` | (Provider adapter) |
| **CpanelAdapter** | `lib/provisioning/adapters/CpanelAdapter.ts` | (Provider adapter) |
| **DomainManager** | `lib/domains/DomainManager.ts` | Domains, DnsZones, DnsRecords, DomainOperations |
| **DomainComponentHandler** | `lib/domains/DomainComponentHandler.ts` | Domains (component lifecycle bridge) |
| **SslCertificateManager** | `lib/ssl/SslCertificateManager.ts` | SslCertificates, SslOperations, SslValidationRecords |
| **SslComponentHandler** | `lib/ssl/SslComponentHandler.ts` | SSL (component lifecycle bridge) |
| **SupportService** | `lib/support/SupportService.ts` | SupportTickets, TicketMessages, SupportCategories, SupportAgentProfiles, SupportSlaProfiles |
| **SupportComponentHandler** | `lib/support/SupportComponentHandler.ts` | Support (component lifecycle bridge) |
| **SupportEmailService** | `lib/support/SupportEmailService.ts` | (Email sending for support) |
| **SupportAutomationEngine** | `lib/support/SupportAutomationEngine.ts` | SupportAutomationRules, SupportTickets |
| **SlaManager** | `lib/support/SlaManager.ts` | SupportSlaProfiles, SupportTickets |
| **TicketNumberService** | `lib/support/TicketNumberService.ts` | (Ticket number generation) |
| **EventService** | `lib/events/EventService.ts` | (BullMQ event bus - no direct DB) |
| **JobScheduler** | `lib/jobs/JobScheduler.ts` | ScheduledJobs, Subscriptions, Payments, DunningAttempts |
| **JobProcessor** | `lib/jobs/JobProcessor.ts` | ScheduledJobs (orchestrates all job workers) |
| **EventProcessor** | `lib/jobs/processors/EventProcessor.ts` | (Event routing - subscription/component/provisioning/billing events) |
| **SubscriptionRenewalProcessor** | `lib/jobs/processors/SubscriptionRenewalProcessor.ts` | Subscriptions, Plans, Invoices, Payments, Clients, Tenants |
| **ProvisioningProcessor** | `lib/jobs/processors/ProvisioningProcessor.ts` | ProvisioningTasks (via ProvisioningManager) |
| **SupportProcessor** | `lib/jobs/processors/SupportProcessor.ts` | SupportTickets (via SupportService) |
| **AuditService** | `lib/audit/AuditService.ts` | AuditLogs |
| **EmailService** | `lib/email/EmailService.ts` | (Generic email sending via nodemailer) |
| **DunningEmailService** | `lib/dunning/DunningEmailService.ts` | (Dunning email templates) |
| **EncryptionService** | `lib/security/EncryptionService.ts` | (Encryption/decryption utility) |
| **Logger** | `lib/logging/Logger.ts` | (Logging utility) |
| **RetryManager** | `lib/resilience/RetryManager.ts` | (Retry logic utility) |
| **HealthChecker** | `lib/health/HealthChecker.ts` | (System health checks) |
| **PluginManager** | `lib/plugins/PluginManager.ts` | Plugins, PluginConfigs |
| **ComponentProviderRegistry** | `lib/catalog/ComponentProviderRegistry.ts` | ComponentProviders, Components |
| **ComponentDefinitionService** | `lib/catalog/ComponentDefinitionService.ts` | Components |
| **ProductService** | `lib/catalog/ProductService.ts` | Products, ProductComponents, BillingPlans |
| **CatalogEventHandlers** | `lib/catalog/CatalogEventHandlers.ts` | (Event handlers for catalog) |
| **ComponentLifecycleService** | `lib/components/ComponentLifecycleService.ts` | SubscribedComponents (orchestrates component provisioning) |
| **ComponentManagementService** | `lib/components/ComponentManagementService.ts` | SubscribedComponents |

---

## 4. Key Business Logic Flows

### 4.1 Subscription Creation Flow
```
1. Client selects product + billing plan (via store)
2. SubscriptionService.createSubscription():
   a. Validate plan exists
   b. Calculate billing dates (currentPeriodStart/End, nextBillingDate)
   c. Handle trial periods (TRIALING status)
   d. INSERT into subscriptions table
   e. If productId provided → createSubscribedComponentsForProduct()
      - Fetch product_components for the product
      - INSERT into subscribed_components for each
   f. Log state change (subscription_state_changes)
   g. Emit 'subscription.activated' event
3. EventProcessor receives 'subscription.activated':
   a. ComponentLifecycleService picks it up
   b. For each subscribed_component, calls registered handler (cpanel/domain/ssl/support)
   c. Provisioning tasks are created and queued
```

### 4.2 Invoice Generation Flow
```
1. Triggered by: subscription renewal, manual creation, or component invoice
2. ComponentInvoiceService.generateInvoice() or SubscriptionService.createRenewalInvoice():
   a. Fetch subscription + components
   b. InvoiceNumberService.generateInvoiceNumber() (atomic counter per tenant/year)
   c. Calculate subtotal from components/plan price
   d. TaxCalculationService.calculateTax() for tax amount
   e. INSERT invoice + invoice_items in transaction
   f. Emit 'invoice.created' event
3. InvoiceEventHandler handles 'invoice.created':
   a. Sends invoice email notification to client
```

### 4.3 Payment Processing Flow
```
1. Payment initiated (manual or from renewal):
   a. INSERT payment record (status: PENDING)
   b. PaymentService.getBestGateway() selects gateway for tenant
   c. Gateway.createPaymentIntent() → Gateway.confirmPayment()
   d. Update payment record with gateway response
2. On Success:
   a. PaymentService.updatePaymentStatus() → COMPLETED
   b. Emit 'payment.succeeded' event
   c. PaymentEventHandler:
      - Mark invoice as PAID
      - Update subscription status (PENDING→ACTIVE, PAST_DUE→ACTIVE)
      - If renewal: update billing dates, emit 'subscription.renewed'
3. On Failure:
   a. PaymentService.updatePaymentStatus() → FAILED
   b. Emit 'payment.failed' event
   c. Increment failedPaymentAttempts on subscription
   d. If ≥3 failures → move to PAST_DUE, emit 'subscription.past_due'
   e. Triggers dunning campaign
```

### 4.4 Provisioning Flow
```
1. Triggered by subscription activation or manual request
2. ProvisioningManager.provision():
   a. Create provisioning_task (status: pending)
   b. Schedule job via JobScheduler (BullMQ queue)
   c. Update task status to in_progress
3. ProvisioningProcessor processes job:
   a. Get provider adapter (CPanel/Plesk/Docker/etc.)
   b. Execute operation (provision/suspend/unsuspend/terminate)
   c. Update provisioning_task with result
   d. Update service_instance with remote data (username, URL, etc.)
4. Adapter operations:
   - CpanelPlugin → CpanelAdapter → WHM API calls
   - Encrypted credentials decrypted on-the-fly
```

### 4.5 Support Ticket Lifecycle
```
1. SupportService.createTicket():
   a. TicketNumberService generates ticket number (TKT-YYYY-NNNNNN)
   b. Auto-assign via category rules or round-robin
   c. SlaManager calculates firstResponseDue + resolutionDue
   d. INSERT ticket + initial message in transaction
   e. Trigger automations + email notifications
2. Message added:
   a. INSERT ticket_message
   b. Update ticket lastActivityAt
   c. Set firstResponseAt if first staff reply
   d. Email notifications to relevant parties
3. Status changes:
   a. OPEN → IN_PROGRESS → WAITING_CUSTOMER/WAITING_STAFF → RESOLVED → CLOSED
   b. System messages logged for each change
   c. Resolution/close timestamps set
4. Background processing:
   - SLA checks (every scheduled interval)
   - Escalation processing
   - Satisfaction surveys (after resolution)
   - Auto-responses
```

### 4.6 Dunning Flow
```
1. Subscription moves to PAST_DUE (after 3 failed payments)
2. DunningManager.startDunningCampaign():
   a. Select strategy (default/gentle/aggressive)
   b. Schedule all dunning attempts based on day offsets
3. Default strategy timeline:
   - Day 1: Email reminder
   - Day 3: Email reminder
   - Day 7: Email reminder  
   - Day 14: Grace period (3 days)
   - Day 17: Suspension
   - Day 30: Cancellation
4. Each attempt:
   a. DunningEmailService sends template-based email
   b. Grace period → update subscription metadata
   c. Suspension → status=PAUSED
   d. Cancellation → status=CANCELLED
```

---

## 5. Natural Module Boundaries

### CORE MODULE (always required)
**Tables**: tenants, users, sessions, clients
**Services**: auth.ts, PermissionManager
**Routers**: auth, users, clients, tenants, dashboard, health
**Frontend**: AdminDashboard, AdminUsers, AdminClients, AdminTenants, AdminRoles, AdminPermissionGroups, AdminRolesAndPermissions, ClientPortal, ClientProfile, ClientOverview

### RBAC MODULE (always required, tightly coupled to core)
**Tables**: roles, permissions, role_permissions, role_hierarchy, user_roles, permission_groups, permission_group_items
**Services**: PermissionManager
**Routers**: permissions, permissionGroups
**Frontend**: AdminRoles, AdminRolesAndPermissions, AdminPermissionGroups

### CATALOG MODULE
**Tables**: components, component_providers, products, product_components, billing_plans, plan_components
**Services**: ComponentDefinitionService, ProductService, CatalogEventHandlers, ComponentProviderRegistry
**Routers**: catalog, components
**Frontend**: CatalogDashboard, ProductsManagement, ComponentRegistrationManagement, all catalog/components/* pages, ProductStorePage, CartPage, CheckoutPage, CheckoutSuccessPage

### SUBSCRIPTION MODULE
**Tables**: subscriptions, subscription_components, subscribed_components, subscription_state_changes
**Services**: SubscriptionService, ComponentLifecycleService, ComponentManagementService
**Routers**: subscriptions
**Frontend**: AdminSubscriptions, ClientSubscriptions

### BILLING / INVOICING MODULE
**Tables**: invoices, invoice_items, invoice_counters
**Services**: InvoiceNumberService, ComponentInvoiceService, InvoiceEventHandler, InvoiceEmailService, InvoicePDFService, InvoicePDFStandards, TaxCalculationService
**Routers**: invoices
**Frontend**: AdminInvoices, AdminBilling, ClientInvoices

### PAYMENTS MODULE
**Tables**: payments, payment_attempts, payment_gateway_configs
**Services**: PaymentService, PaymentGatewayService, PaymentGatewayManager, PaymentEventHandler, StripeGateway
**Routers**: payment-gateways
**Frontend**: AdminPaymentGateways

### DUNNING MODULE (sub-module of Billing+Subscriptions)
**Tables**: dunning_attempts
**Services**: DunningManager, DunningEmailService
**Frontend**: (managed within billing/subscription views)

### PROVISIONING MODULE
**Tables**: provisioning_providers, service_instances, provisioning_tasks
**Services**: ProvisioningManager, CpanelPlugin, CpanelAdapter, ProvisioningProcessor
**Routers**: provisioning
**Frontend**: AdminProvisioning

### DOMAINS MODULE
**Tables**: domains, dns_zones, dns_records, domain_operations
**Services**: DomainManager, DomainComponentHandler, NamecheapRegistrar
**Frontend**: AdminDomains

### SSL MODULE
**Tables**: ssl_certificates, ssl_certificate_operations, ssl_validation_records
**Services**: SslCertificateManager, SslComponentHandler
**Frontend**: AdminSSL

### SUPPORT MODULE
**Tables**: support_categories, support_tickets, ticket_messages, knowledge_base_categories, knowledge_base_articles, support_automation_rules, support_sla_profiles, support_agent_profiles
**Services**: SupportService, SupportEmailService, SupportAutomationEngine, SlaManager, TicketNumberService, SupportComponentHandler, SupportProcessor
**Routers**: support
**Frontend**: SupportDashboard, SupportTickets

### AUDIT MODULE
**Tables**: audit_logs, audit_log_retention_policies, audit_log_exports
**Services**: AuditService
**Routers**: audit
**Frontend**: AdminAuditLogs

### PLUGIN MODULE
**Tables**: plugins, plugin_configs, plugin_hooks, plugin_extension_points
**Services**: PluginManager, BasePlugin, DomainPlugin, SslPlugin, CpanelPlugin (plugin variant), SupportPlugin, NotificationPlugin
**Frontend**: AdminPlugins

### INFRASTRUCTURE / SHARED (not a "module" — cross-cutting)
**Tables**: scheduled_jobs
**Services**: EventService, JobScheduler, JobProcessor, EventProcessor, EmailService, EncryptionService, Logger, RetryManager, HealthChecker
**Routers**: health
**Frontend**: AdminAnalytics

---

## 6. What Should Be "Core" vs "Modules"

### CORE (mandatory, always present):
1. **Multi-tenancy**: tenants, users, sessions, clients
2. **RBAC**: roles, permissions, role_permissions, role_hierarchy, user_roles, permission_groups
3. **Event Bus**: EventService, EventProcessor (the backbone for inter-module communication)
4. **Job Scheduling**: JobScheduler, JobProcessor, scheduled_jobs (background processing infra)
5. **Email**: EmailService (generic sending capability)
6. **Security**: EncryptionService
7. **Logging/Audit**: Logger, AuditService, audit_logs
8. **Health**: HealthChecker
9. **Plugin System**: PluginManager, plugins, plugin_configs

### MODULES (optional, can be enabled/disabled):
1. **Catalog** - Product and component definitions
2. **Subscriptions** - Subscription lifecycle (depends on Catalog)
3. **Billing/Invoicing** - Invoice generation and management (depends on Subscriptions)
4. **Payments** - Payment gateway integration (depends on Billing)
5. **Dunning** - Failed payment recovery (depends on Payments + Subscriptions)
6. **Provisioning** - Server/service provisioning (depends on Subscriptions)
7. **Domains** - Domain registration and DNS management
8. **SSL** - SSL certificate management (optional dependency on Domains + Provisioning)
9. **Support** - Ticketing, KB, SLA, automation
10. **Analytics** - Reporting and dashboards (read-only from all other modules)

### Module Dependency Graph:
```
Core ← Catalog ← Subscriptions ← Billing ← Payments ← Dunning
                                 ↑
                    Provisioning ←┘
                    Domains
                    SSL (→ Domains, → Provisioning)
                    Support (independent)
                    Analytics (reads all)
```

---

## 7. Background Jobs Inventory

### Cron Jobs (via node-cron in JobScheduler):
| Schedule | Job | Description |
|---|---|---|
| `0 1 * * *` (daily 1AM) | `scheduleSubscriptionRenewals` | Find subscriptions due in next 24h, queue renewal jobs |
| `0 * * * *` (hourly) | `processFailedPayments` | Find failed payments under max retries, queue retry jobs |
| `0 */6 * * *` (every 6h) | `processDunningCampaigns` | Find PAST_DUE subscriptions, queue dunning jobs |
| `*/30 * * * *` (every 30min) | `processScheduledJobs` | Process overdue scheduled_jobs records |

### BullMQ Queues:
| Queue | Processor | Concurrency | Description |
|---|---|---|---|
| `events` | EventProcessor (Worker) | 10 | Central event bus - routes all domain events |
| `subscription-renewal` | JobProcessor (inline) | 5 | Process subscription renewals |
| `invoice-generation` | JobProcessor (inline) | 3 | Generate invoices |
| `payment-retry` | JobProcessor (inline) | 3 | Retry failed payments |
| `dunning-management` | JobProcessor (inline) | 2 | Execute dunning campaigns/attempts |
| `provisioning-provision` | ProvisioningManager | - | Provision new services |
| `provisioning-suspend` | ProvisioningManager | - | Suspend services |
| `provisioning-unsuspend` | ProvisioningManager | - | Unsuspend services |
| `provisioning-terminate` | ProvisioningManager | - | Terminate services |
| `provisioning-modify` | ProvisioningManager | - | Modify existing services |
| `provisioning-sync` | ProvisioningManager | - | Sync service state |
| `provisioning-health-check` | ProvisioningManager | - | Provider health checks |

---

## 8. Email Templates Inventory

### Invoice Emails (InvoiceEmailService):
| Template | Trigger | Content |
|---|---|---|
| `created` | invoice.created event | New invoice notification with amount and due date |
| `paid` | Payment succeeded | Payment receipt confirmation |
| `overdue` | Invoice past due | Overdue notice with payment urgency |
| `reminder` | Scheduled | Payment reminder before due date |

### Dunning Emails (DunningEmailService):
| Template | Trigger | Content |
|---|---|---|
| `payment_failed_day_1` | Day 1 after failure | Low urgency payment failed notice |
| `payment_failed_day_3` | Day 3 | Medium urgency |
| `payment_failed_day_7` | Day 7 | High urgency, final notice |
| `gentle_reminder_day_2` | Day 2 (gentle strategy) | Soft payment reminder |
| `gentle_reminder_day_7` | Day 7 (gentle) | |
| `gentle_reminder_day_14` | Day 14 (gentle) | |
| `immediate_payment_required` | Day 0 (aggressive strategy) | Urgent immediate payment |
| `urgent_payment_day_1` | Day 1 (aggressive) | |
| `urgent_payment_day_3` | Day 3 (aggressive) | |
| `grace_period_notice` | Grace period activated | Grace period notification |
| `suspension_notice` | Service suspended | Suspension notification |
| `cancellation_notice` | Service cancelled | Cancellation notification |

### Support Emails (SupportEmailService):
| Template | Trigger | Content |
|---|---|---|
| `ticket_created` | Ticket created | Ticket confirmation with number |
| `message_reply` | Staff reply added | New response notification |
| `status_changed` | Ticket status change | Status update notification |
| `assignment_notification` | Ticket assigned | Agent assignment notification |
| `escalation_notice` | Ticket escalated | Escalation alert |

### Support Auto-Responses (SupportProcessor):
| Template | Trigger | Content |
|---|---|---|
| `acknowledgment` | Default auto-response | "We received your ticket" |
| `business_hours` | Outside business hours | Business hours notice |
| `password_reset` | Password reset request | Password reset instructions |
| `billing_inquiry` | Billing question | 24h billing response SLA |
| `technical_support` | Technical issue | Technical info request |
| `feature_request` | Feature request | Feature request acknowledgment |
| `account_issue` | Account issue | Account verification notice |

---

## 9. Frontend Page Inventory

### Admin Pages (27 pages):
| Page | Route | Domain |
|---|---|---|
| AdminDashboard | `/admin` | Core |
| AdminUsers | `/admin/users` | Core |
| AdminClients | `/admin/clients` | Core |
| AdminTenants | `/admin/tenants` | Core |
| AdminRoles | `/admin/roles` | RBAC |
| AdminRolesAndPermissions | `/admin/roles` (actual route) | RBAC |
| AdminPermissionGroups | `/admin/permission-groups` | RBAC |
| AdminSubscriptions | `/admin/subscriptions` | Subscriptions |
| AdminBilling | `/admin/billing` | Billing |
| AdminInvoices | `/admin/invoices` | Billing |
| AdminPlans | `/admin/plans` | Catalog |
| AdminPaymentGateways | `/admin/payment-gateways` | Payments |
| AdminProvisioning | `/admin/provisioning` | Provisioning |
| AdminDomains | `/admin/domains` | Domains |
| AdminSSL | `/admin/ssl` | SSL |
| AdminAnalytics | `/admin/analytics` | Analytics |
| AdminAuditLogs | `/admin/audit-logs` | Audit |
| AdminPlugins | `/admin/plugins` | Plugins |
| CatalogDashboard | `/admin/catalog` | Catalog |
| ProductsManagement | `/admin/catalog/products` | Catalog |
| ComponentRegistrationManagement | `/admin/catalog/components` | Catalog |
| SupportDashboard | `/admin/support` | Support |
| SupportTickets | `/admin/support/tickets` | Support |
| Knowledge Base | `/admin/support/knowledge-base` | Support (placeholder) |
| Automation Rules | `/admin/support/automation` | Support (placeholder) |
| Agent Management | `/admin/support/agents` | Support (placeholder) |
| Settings | `/admin/settings` | Core (placeholder) |

### Store Pages (4 pages):
| Page | Route | Domain |
|---|---|---|
| ProductStorePage | `/store` | Catalog/Store |
| CartPage | `/cart` | Catalog/Store |
| CheckoutPage | `/checkout` | Payments/Store |
| CheckoutSuccessPage | `/checkout/success` | Payments/Store |

### Client Portal Pages (6 pages):
| Page | Route | Domain |
|---|---|---|
| ClientPortal | `/client` | Core |
| ClientPortalRefactored | `/client` (alternate) | Core |
| ClientOverview | `/client` (tab) | Core |
| ClientSubscriptions | `/client/subscriptions` (tab) | Subscriptions |
| ClientInvoices | `/client/invoices` (tab) | Billing |
| ClientProfile | `/client/profile` (tab) | Core |

### API Routers (19 routers):
| Router | File | Domain |
|---|---|---|
| auth | `routers/auth.ts` | Core |
| users | `routers/users.ts` | Core |
| clients | `routers/clients.ts` | Core |
| tenants | `routers/tenants.ts` | Core |
| dashboard | `routers/dashboard.ts` | Core |
| health | `routers/health.ts` | Core/Infra |
| permissions | `routers/permissions.ts` | RBAC |
| permissionGroups | `routers/permissionGroups.ts` | RBAC |
| catalog | `routers/catalog.ts` | Catalog |
| components | `routers/components.ts` | Catalog |
| plans | `routers/plans.ts` | Catalog |
| subscriptions | `routers/subscriptions.ts` | Subscriptions |
| invoices | `routers/invoices.ts` | Billing |
| payment-gateways | `routers/payment-gateways.ts` | Payments |
| provisioning | `routers/provisioning.ts` | Provisioning |
| support | `routers/support.ts` | Support |
| analytics | `routers/analytics.ts` | Analytics |
| audit | `routers/audit.ts` | Audit |

---

## 10. App Bootstrap Sequence (index.ts)

```
1. Express app setup (helmet, cors, health endpoint, tRPC middleware)
2. initializeServices():
   a. PluginManager.initialize() → load installed plugins from DB
   b. initializeEmailService() → configure SMTP transporter
   c. ComponentProviderRegistry.initialize() → register component providers
   d. CatalogEventHandlers.initialize() → subscribe to catalog events
   e. PaymentEventHandler.initialize() → subscribe to payment events
   f. JobProcessor.initialize() → create BullMQ queues + workers
   g. EventProcessor.start() → start central event bus worker
   h. ComponentLifecycleService.getInstance() → register handlers:
      - 'cpanel' → CpanelPlugin
      - 'domain-manager' → DomainComponentHandler
      - 'ssl-manager' → SslComponentHandler
      - 'support-manager' → SupportComponentHandler
   i. ComponentLifecycleService.start()
3. Graceful shutdown handlers (SIGTERM, SIGINT)
```
