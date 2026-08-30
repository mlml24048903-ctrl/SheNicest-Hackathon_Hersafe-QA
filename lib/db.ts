import { PrismaClient } from "@prisma/client";

// Prisma 单例：Next.js 开发模式热重载时避免重复创建连接池
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
