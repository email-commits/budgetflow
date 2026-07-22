import { PrismaClient } from "@prisma/client";

/** True when a database is configured — the app falls back to file/env storage without one. */
export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Singleton Prisma client (dev hot-reload safe). Only call when dbConfigured(). */
export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}
