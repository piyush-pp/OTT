import { prisma } from "../db/prisma.js";
import { s3, presignPutObject, deleteByPrefix } from "./s3.js";
import { env } from "../utils/env.js";
import { adTranscodeQueue } from "../queue/adQueue.js";
import { HttpError } from "../utils/errors.js";
import { paginate } from "../utils/pagination.js";
import type { AdCampaignStatus, AdBreakType } from "@prisma/client";

// ─── Ad Creatives ─────────────────────────────────────────────────────────────

export const adService = {
  // Return a presigned PUT URL so the admin can upload the raw MP4 directly to S3.
  async getUploadUrl(creativeId: string) {
    const key = `ads/${creativeId}/input.mp4`;
    const url = await presignPutObject({
      bucket: env.S3_BUCKET,
      key,
      contentType: "video/mp4",
      expiresInSeconds: 60 * 15 // 15 min
    });
    return { uploadUrl: url, key };
  },

  // Called after the admin has finished uploading the raw MP4.
  // Creates the DB record and enqueues a transcode job.
  async createCreative(params: {
    title: string;
    advertiserName: string;
    clickUrl?: string;
    skipOffsetSec?: number;
    durationSec: number;
    inputKey: string;
  }) {
    const creative = await prisma.adCreative.create({
      data: {
        title: params.title,
        advertiserName: params.advertiserName,
        clickUrl: params.clickUrl ?? null,
        skipOffsetSec: params.skipOffsetSec ?? null,
        durationSec: params.durationSec,
        inputKey: params.inputKey,
        status: "PENDING"
      }
    });

    await adTranscodeQueue.add("ad-transcode", {
      creativeId: creative.id,
      bucket: env.S3_BUCKET,
      inputKey: params.inputKey
    });

    return creative;
  },

  async listCreatives(params: { page: number; pageSize: number }) {
    const [items, total] = await Promise.all([
      prisma.adCreative.findMany({
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize
      }),
      prisma.adCreative.count()
    ]);
    return paginate(items, total, params.page, params.pageSize);
  },

  async getCreative(id: string) {
    const c = await prisma.adCreative.findUnique({ where: { id } });
    if (!c) throw new HttpError(404, "Ad creative not found");
    return c;
  },

  async deleteCreative(id: string) {
    const c = await prisma.adCreative.findUnique({ where: { id } });
    if (!c) throw new HttpError(404, "Ad creative not found");

    // Remove HLS/thumbnail assets (keyed under the cuid)
    await deleteByPrefix({ bucket: env.S3_BUCKET, prefix: `ads/${id}/` });

    // Also remove the raw input MP4 if it was uploaded under a different S3 prefix
    // (the upload-url step uses a UUID for the input key, not the DB cuid)
    if (c.inputKey && !c.inputKey.startsWith(`ads/${id}/`)) {
      const inputPrefix = c.inputKey.split("/input.mp4")[0];
      if (inputPrefix) {
        await deleteByPrefix({ bucket: env.S3_BUCKET, prefix: `${inputPrefix}/` });
      }
    }

    await prisma.adCreative.delete({ where: { id } });
  },

  // ─── Campaigns ──────────────────────────────────────────────────────────────

  async createCampaign(params: {
    name: string;
    advertiser: string;
    budgetCents: number;
    startDate: Date;
    endDate: Date;
  }) {
    return prisma.adCampaign.create({ data: { ...params, status: "DRAFT" } });
  },

  async updateCampaign(id: string, params: {
    name?: string;
    advertiser?: string;
    budgetCents?: number;
    startDate?: Date;
    endDate?: Date;
    status?: AdCampaignStatus;
  }) {
    const existing = await prisma.adCampaign.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Campaign not found");
    return prisma.adCampaign.update({ where: { id }, data: params });
  },

  async listCampaigns(params: { page: number; pageSize: number }) {
    const [items, total] = await Promise.all([
      prisma.adCampaign.findMany({
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          _count: { select: { placements: true } }
        }
      }),
      prisma.adCampaign.count()
    ]);
    return paginate(items, total, params.page, params.pageSize);
  },

  async getCampaign(id: string) {
    const c = await prisma.adCampaign.findUnique({
      where: { id },
      include: { placements: { include: { creative: true } } }
    });
    if (!c) throw new HttpError(404, "Campaign not found");
    return c;
  },

  async deleteCampaign(id: string) {
    const c = await prisma.adCampaign.findUnique({ where: { id } });
    if (!c) throw new HttpError(404, "Campaign not found");
    await prisma.adCampaign.delete({ where: { id } });
  },

  // ─── Placements ─────────────────────────────────────────────────────────────

  async createPlacement(params: {
    campaignId: string;
    creativeId: string;
    breakType: AdBreakType;
    midRollOffsetSec?: number;
    targetCategory?: string;
    targetVideoId?: string;
    maxAdsPerPod?: number;
    frequencyCapPerDay?: number;
    cpmCents?: number;
  }) {
    // Verify campaign and creative exist
    const [campaign, creative] = await Promise.all([
      prisma.adCampaign.findUnique({ where: { id: params.campaignId } }),
      prisma.adCreative.findUnique({ where: { id: params.creativeId } })
    ]);
    if (!campaign) throw new HttpError(404, "Campaign not found");
    if (!creative) throw new HttpError(404, "Ad creative not found");
    if (creative.status !== "READY") throw new HttpError(400, "Ad creative is not ready yet");
    if (params.breakType === "MID" && params.midRollOffsetSec == null) {
      throw new HttpError(400, "midRollOffsetSec is required for MID break type");
    }

    return prisma.adPlacement.create({
      data: {
        campaignId: params.campaignId,
        creativeId: params.creativeId,
        breakType: params.breakType,
        midRollOffsetSec: params.midRollOffsetSec ?? null,
        targetCategory: params.targetCategory ?? null,
        targetVideoId: params.targetVideoId ?? null,
        maxAdsPerPod: params.maxAdsPerPod ?? 1,
        frequencyCapPerDay: params.frequencyCapPerDay ?? 3,
        cpmCents: params.cpmCents ?? 0
      },
      include: { campaign: true, creative: true }
    });
  },

  async listPlacements(params: {
    page: number;
    pageSize: number;
    campaignId?: string;
  }) {
    const where = params.campaignId ? { campaignId: params.campaignId } : {};
    const [items, total] = await Promise.all([
      prisma.adPlacement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          campaign: { select: { id: true, name: true, status: true } },
          creative: { select: { id: true, title: true, status: true, durationSec: true } }
        }
      }),
      prisma.adPlacement.count({ where })
    ]);
    return paginate(items, total, params.page, params.pageSize);
  },

  async deletePlacement(id: string) {
    const p = await prisma.adPlacement.findUnique({ where: { id } });
    if (!p) throw new HttpError(404, "Placement not found");
    await prisma.adPlacement.delete({ where: { id } });
  },

  // ─── Analytics ──────────────────────────────────────────────────────────────

  async getAnalytics(params: {
    campaignId?: string;
    creativeId?: string;
    from: Date;
    to: Date;
  }) {
    const where: {
      recordedAt: { gte: Date; lte: Date };
      campaignId?: string;
      creativeId?: string;
    } = {
      recordedAt: { gte: params.from, lte: params.to }
    };
    // AdImpression has placementId → join through placement for campaignId filter
    const impressions = await prisma.adImpression.findMany({
      where: {
        recordedAt: { gte: params.from, lte: params.to },
        ...(params.creativeId ? { creativeId: params.creativeId } : {}),
        ...(params.campaignId
          ? { placement: { campaignId: params.campaignId } }
          : {})
      },
      select: {
        creativeId: true,
        placementId: true,
        event: true,
        recordedAt: true
      },
      orderBy: { recordedAt: "asc" }
    });

    // Aggregate by creative + event
    const byCreative: Record<string, Record<string, number>> = {};
    for (const imp of impressions) {
      if (!byCreative[imp.creativeId]) byCreative[imp.creativeId] = {};
      byCreative[imp.creativeId]![imp.event] =
        (byCreative[imp.creativeId]![imp.event] ?? 0) + 1;
    }

    // Aggregate by day
    const byDay: Record<string, number> = {};
    for (const imp of impressions.filter((i) => i.event === "IMPRESSION")) {
      const day = imp.recordedAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + 1;
    }

    return {
      totalImpressions: impressions.filter((i) => i.event === "IMPRESSION").length,
      totalCompletions: impressions.filter((i) => i.event === "COMPLETE").length,
      totalSkips: impressions.filter((i) => i.event === "SKIP").length,
      byCreative,
      byDay: Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }))
    };
  }
};
