# API Design Standards

This document outlines the standards and best practices for designing and implementing APIs in Panel1. Consistency in the API is crucial for maintainability, developer experience, and frontend integration.

## Core Principles

1.  **Type Safety First**: We use **tRPC** to achieve end-to-end type safety. There is no code generation; types are inferred directly from your backend router definitions.
2.  **Explicit is Better than Implicit**: API inputs and outputs should be clearly defined. Use **Zod** for validation to ensure all data is explicit and validated at the runtime boundary.
3.  **Standardized Error Handling**: Errors should be consistent and provide meaningful information to the client.

## tRPC Router Structure

All API code resides in `apps/api/src/routers/`. Each major feature or resource (e.g., `invoices`, `clients`, `subscriptions`) should have its own router file.

-   Routers are created using `createTRPCRouter` from `~/trpc/trpc.ts`.
-   Individual procedures (endpoints) can be `query` (for data fetching) or `mutation` (for data modification).
-   Routers are combined in the main app router in `apps/api/src/routers/index.ts`.

### Example Router

```typescript
// apps/api/src/routers/example.ts
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '~/trpc/trpc';

export const exampleRouter = createTRPCRouter({
  getExample: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // ctx.db and ctx.session are available here
      return { message: `Hello, ${input.id}` };
    }),

  updateExample: protectedProcedure
    .input(z.object({ id: z.string(), data: z.any() }))
    .mutation(async ({ ctx, input }) => {
      // Perform update logic
      return { success: true };
    }),
});
```

## Procedures (`protectedProcedure` vs `publicProcedure`)

-   **`protectedProcedure`**: Use this for any procedure that requires an authenticated user. It automatically checks for a valid session and adds the `session` and `db` objects to the context (`ctx`). This should be your default choice.
-   **`publicProcedure`**: Only use this for procedures that are genuinely public, such as login, registration, or public data endpoints.

## Input Validation with Zod

-   **Always validate inputs**. Every procedure that accepts input must define a Zod schema using `.input()`.
-   Be as specific as possible with your schemas (e.g., `z.string().email()` instead of `z.string()`).
-   For complex objects, define a reusable Zod schema.

## Error Handling

tRPC handles errors gracefully. To throw an error from a procedure, use `TRPCError` from `@trpc/server`.

```typescript
import { TRPCError } from '@trpc/server';

// Inside a procedure
if (!item) {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: `Item with ID ${input.id} not found.`,
  });
}
```

### Common Error Codes

-   `NOT_FOUND`: The requested resource does not exist.
-   `UNAUTHORIZED`: The user is not logged in.
-   `FORBIDDEN`: The user is logged in but does not have permission to perform the action.
-   `BAD_REQUEST`: The input is invalid or malformed (though Zod validation often catches this).
-   `INTERNAL_SERVER_ERROR`: For unexpected server errors.

## Naming Conventions

-   **Routers**: Use camelCase followed by `Router` (e.g., `invoiceRouter`).
-   **Procedures**: Use camelCase. Start with a verb (e.g., `getInvoice`, `createClient`, `deleteSubscription`).
-   **Consistency is key**. Look at existing routers for examples.

By adhering to these standards, we ensure that the Panel1 API remains robust, predictable, and easy to work with.

## API Design Principles

### 1. Type Safety
- All API endpoints must be fully typed
- Use Zod for runtime validation
- Leverage TypeScript for compile-time checks
- Share types between frontend and backend

### 2. Error Handling
- Use standardized error types
- Include proper error codes
- Provide meaningful error messages
- Handle edge cases gracefully

### 3. Authentication
- JWT-based authentication
- Include authorization headers
- Validate tokens on each request
- Handle token expiration

### 4. Performance
- Optimize database queries
- Use proper caching strategies
- Implement pagination
- Handle rate limiting

## Router Structure

### 1. Router Organization
```typescript
// Example router structure
export const catalogRouter = router({
  list: publicProcedure
    .input(z.object({...}))
    .query(async ({ctx, input}) => {...}),
  
  create: protectedProcedure
    .input(z.object({...}))
    .mutation(async ({ctx, input}) => {...}),
});
```

### 2. Procedure Types
- `publicProcedure`: No authentication required
- `protectedProcedure`: Requires authentication
- `adminProcedure`: Requires admin privileges
- Custom procedures for specific roles

### 3. Input Validation
- Use Zod schemas for all inputs
- Validate required fields
- Type check all parameters
- Handle invalid inputs gracefully

## API Endpoints

### 1. Naming Conventions
- Use descriptive names
- Follow REST-like patterns
- Be consistent across routers
- Use proper HTTP methods

### 2. Response Format
```typescript
// Standard success response
{
  success: true,
  data: T,
  metadata?: {
    count?: number,
    page?: number,
    // ... other metadata
  }
}

// Standard error response
{
  success: false,
  error: {
    code: string,
    message: string,
    details?: unknown
  }
}
```

### 3. Pagination
- Use cursor-based pagination
- Include total counts
- Support limit/offset
- Handle empty results

## Security Standards

### 1. Authentication
- Secure token handling
- Proper session management
- Token refresh mechanism
- Logout handling

### 2. Authorization
- Role-based access control
- Permission checking
- Tenant isolation
- Resource ownership

### 3. Data Protection
- Input sanitization
- SQL injection prevention
- XSS protection
- CSRF protection

## Error Handling

### 1. Error Types
```typescript
export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  // ... other error codes
}
```

### 2. Error Responses
- Include stack traces in development
- Sanitize error messages in production
- Log errors appropriately
- Include request IDs

## Testing Standards

### 1. Unit Tests
- Test each procedure independently
- Mock external dependencies
- Test error cases
- Verify type safety

### 2. Integration Tests
- Test complete workflows
- Verify database operations
- Test authentication flow
- Check error handling

## Documentation

### 1. Code Documentation
- Document all procedures
- Include example usage
- Document error cases
- Keep documentation updated

### 2. API Documentation
- Generate API documentation
- Include example requests/responses
- Document error codes
- Maintain changelog

## Performance Guidelines

### 1. Query Optimization
- Use proper indexes
- Optimize JOIN operations
- Implement caching
- Monitor query performance

### 2. Rate Limiting
- Implement per-user limits
- Handle burst traffic
- Set appropriate timeouts
- Monitor API usage

## Versioning

### 1. Version Control
- Semantic versioning
- Breaking changes handling
- Deprecation notices
- Migration guides

### 2. Backwards Compatibility
- Maintain compatibility
- Document changes
- Provide migration paths
- Support multiple versions

## Monitoring

### 1. Logging
- Request/response logging
- Error logging
- Performance metrics
- Audit trails

### 2. Metrics
- Response times
- Error rates
- Usage statistics
- Resource utilization

## Development Workflow

### 1. Code Review
- Review type safety
- Check error handling
- Verify security measures
- Test coverage

### 2. Deployment
- Staging environment
- Production deployment
- Rollback procedures
- Monitoring setup 