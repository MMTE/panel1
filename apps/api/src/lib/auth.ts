import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { users, sessions, permissions, rolePermissions, type User, type NewUser, type NewSession } from '../db/schema/users.js';
import { eq, and, gte, lt } from 'drizzle-orm';
import { PermissionManager } from './auth/PermissionManager.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = '7d';
const SESSION_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'SUPPORT_AGENT' | 'BILLING_AGENT' | 'RESELLER' | 'CLIENT' | 'CLIENT_USER';
  tenantId?: string | null;
  permissions?: string[];
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  tenantId?: string | null;
  iat?: number;
  jti?: string;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token
 */
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Create a new session for a user
 */
export async function createSession(userId: string): Promise<string> {
  // Get user data for more accurate token
  const user = await getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Add unique timestamp and random string to ensure token uniqueness
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  
  const token = generateToken({ 
    userId, 
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    iat: Math.floor(Date.now() / 1000),
    jti: `${uniqueId}-${timestamp}` // JWT ID for uniqueness
  });
  
  const expiresAt = new Date(Date.now() + SESSION_EXPIRES_IN);
  
  // Clean up any existing sessions for this user first (dev mode cleanup)
  if (process.env.NODE_ENV !== 'production') {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }
  
  await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
  });
  
  return token;
}

/**
 * Get session by token
 */
export async function getSessionByToken(token: string) {
  const result = await db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.token, token),
        gte(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  return result[0] || null;
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(
    and(
      lt(sessions.expiresAt, new Date())
    )
  );
}

/**
 * Load user permissions from the database
 */
async function loadUserPermissions(role: string): Promise<string[]> {
  try {
    const permissionManager = PermissionManager.getInstance();
    return await permissionManager.getRolePermissions(role as any);
  } catch (error) {
    console.error('Failed to load user permissions:', error);
    return [];
  }
}

/**
 * Register a new user
 */
export async function registerUser(userData: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: 'ADMIN' | 'CLIENT' | 'RESELLER';
  tenantId?: string;
}): Promise<User> {
  const hashedPassword = await hashPassword(userData.password);
  
  const newUser: NewUser = {
    email: userData.email,
    password: hashedPassword,
    firstName: userData.firstName || null,
    lastName: userData.lastName || null,
    role: userData.role || 'CLIENT',
    tenantId: userData.tenantId || null,
  };

  const [user] = await db.insert(users).values(newUser).returning();
  return user;
}

/**
 * Authenticate user by email and password
 */
export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.email, email),
      eq(users.isActive, true)
    ))
    .limit(1);

  if (!user) {
    return null;
  }

  const isValidPassword = await verifyPassword(password, user.password);
  if (!isValidPassword) {
    return null;
  }

  // Load user permissions
  const userPermissions = await loadUserPermissions(user.role);

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as any,
    tenantId: user.tenantId,
    permissions: userPermissions,
  };
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(
      eq(users.id, id),
      eq(users.isActive, true)
    ))
    .limit(1);

  if (!user) {
    return null;
  }

  // Load user permissions
  const userPermissions = await loadUserPermissions(user.role);

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as any,
    tenantId: user.tenantId,
    permissions: userPermissions,
  };
} 