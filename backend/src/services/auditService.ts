import type { Request } from "express";
import { prisma } from "../db/prisma.js";

export type AuditLogParams = {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
};

export const auditService = {
  async log(params: AuditLogParams) {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        metadata: (params.metadata ?? undefined) as never,
        ip: params.req?.ip ?? null,
        userAgent: params.req?.get("user-agent") ?? null
      }
    });
  }
};
