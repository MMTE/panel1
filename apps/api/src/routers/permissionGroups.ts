import { z } from 'zod';
import { router, adminProcedure } from '../trpc/trpc';
import { db } from '../db';
import { permissionGroups, permissionGroupItems, permissions } from '../db/schema/roles';
import { TRPCError } from '@trpc/server';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const permissionGroupsRouter = router({
  // Get all permission groups
  list: adminProcedure.query(async () => {
    const groups = await db.query.permissionGroups.findMany({
      with: {
        permissions: {
          with: {
            permission: true
          }
        }
      }
    });

    return groups.map(group => ({
      id: group.id,
      name: group.name,
      description: group.description,
      permissions: group.permissions.map(p => p.permission)
    }));
  }),

  // Get a single permission group
  getById: adminProcedure
    .input(z.object({
      id: z.string()
    }))
    .query(async ({ input }) => {
      const group = await db.query.permissionGroups.findFirst({
        where: eq(permissionGroups.id, input.id),
        with: {
          permissions: {
            with: {
              permission: true
            }
          }
        }
      });

      if (!group) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Permission group not found'
        });
      }

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        permissions: group.permissions.map(p => p.permission)
      };
    }),

  // Create a new permission group
  create: adminProcedure
    .input(z.object({
      name: z.string().min(3),
      description: z.string(),
      permissionIds: z.array(z.string())
    }))
    .mutation(async ({ input }) => {
      // Check if group name already exists
      const existing = await db.query.permissionGroups.findFirst({
        where: eq(permissionGroups.name, input.name)
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A permission group with this name already exists'
        });
      }

      // Create group
      const groupId = nanoid();
      await db.insert(permissionGroups).values({
        id: groupId,
        name: input.name,
        description: input.description
      });

      // Add permissions to group
      if (input.permissionIds.length > 0) {
        await db.insert(permissionGroupItems).values(
          input.permissionIds.map(permissionId => ({
            groupId,
            permissionId
          }))
        );
      }

      return { id: groupId };
    }),

  // Update a permission group
  update: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(3),
      description: z.string(),
      permissionIds: z.array(z.string())
    }))
    .mutation(async ({ input }) => {
      // Check if group exists
      const existing = await db.query.permissionGroups.findFirst({
        where: eq(permissionGroups.id, input.id)
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Permission group not found'
        });
      }

      // Check if new name conflicts with another group
      if (input.name !== existing.name) {
        const nameExists = await db.query.permissionGroups.findFirst({
          where: and(
            eq(permissionGroups.name, input.name),
            eq(permissionGroups.id, input.id)
          )
        });

        if (nameExists) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A permission group with this name already exists'
          });
        }
      }

      // Update group
      await db.update(permissionGroups)
        .set({
          name: input.name,
          description: input.description,
          updatedAt: new Date()
        })
        .where(eq(permissionGroups.id, input.id));

      // Update permissions
      await db.delete(permissionGroupItems)
        .where(eq(permissionGroupItems.groupId, input.id));

      if (input.permissionIds.length > 0) {
        await db.insert(permissionGroupItems).values(
          input.permissionIds.map(permissionId => ({
            groupId: input.id,
            permissionId
          }))
        );
      }

      return { success: true };
    }),

  // Delete a permission group
  delete: adminProcedure
    .input(z.object({
      id: z.string()
    }))
    .mutation(async ({ input }) => {
      const group = await db.query.permissionGroups.findFirst({
        where: eq(permissionGroups.id, input.id)
      });

      if (!group) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Permission group not found'
        });
      }

      await db.delete(permissionGroups)
        .where(eq(permissionGroups.id, input.id));

      return { success: true };
    })
}); 