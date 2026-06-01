import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../utils/errors.js";
import { paginationSchema } from "../utils/pagination.js";
import { adService } from "../services/adService.js";
import { auditService } from "../services/auditService.js";
import { CATEGORIES } from "../utils/categories.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createCreativeSchema = z.object({
  title: z.string().min(1).max(200),
  advertiserName: z.string().min(1).max(200),
  clickUrl: z.string().url().optional(),
  skipOffsetSec: z.number().int().min(1).optional(), // null = non-skippable
  durationSec: z.number().int().min(1).max(600),      // max 10 min ad
  inputKey: z.string().min(1)                         // S3 key from upload-url step
});

const campaignSchema = z.object({
  name: z.string().min(1).max(200),
  advertiser: z.string().min(1).max(200),
  budgetCents: z.number().int().min(0).default(0),
  startDate: z.coerce.date(),
  endDate: z.coerce.date()
});

const campaignPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  advertiser: z.string().min(1).max(200).optional(),
  budgetCents: z.number().int().min(0).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "DONE"]).optional()
});

const placementSchema = z.object({
  campaignId: z.string().min(1),
  creativeId: z.string().min(1),
  breakType: z.enum(["PRE", "MID", "POST"]),
  midRollOffsetSec: z.number().int().min(0).optional(),
  targetCategory: z
    .enum(CATEGORIES as unknown as [string, ...string[]])
    .nullable()
    .optional(),
  targetVideoId: z.string().nullable().optional(),
  maxAdsPerPod: z.number().int().min(1).max(5).default(1),
  frequencyCapPerDay: z.number().int().min(0).default(3)
});

const analyticsQuerySchema = z.object({
  campaignId: z.string().optional(),
  creativeId: z.string().optional(),
  from: z.coerce.date().default(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  }),
  to: z.coerce.date().default(() => new Date())
});

// ─── Creative handlers ────────────────────────────────────────────────────────

export async function getCreativeUploadUrl(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");

    // Generate a temp creative ID so the S3 key is known before the DB row exists.
    const { randomUUID } = await import("node:crypto");
    const creativeId = randomUUID();
    const { uploadUrl, key } = await adService.getUploadUrl(creativeId);

    res.json({ uploadUrl, key, creativeId });
  } catch (err) {
    next(err);
  }
}

export async function createCreative(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const body = createCreativeSchema.parse(req.body ?? {});
    const creative = await adService.createCreative(body);

    auditService
      .log({
        userId: req.user.id,
        action: "ad.creative.create",
        entityType: "AdCreative",
        entityId: creative.id,
        metadata: { title: creative.title, advertiser: creative.advertiserName },
        req
      })
      .catch(console.error);

    res.status(201).json(creative);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function listCreatives(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, pageSize } = paginationSchema.parse(req.query);
    res.json(await adService.listCreatives({ page, pageSize }));
  } catch (err) {
    next(err);
  }
}

export async function getCreative(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    res.json(await adService.getCreative(id));
  } catch (err) {
    next(err);
  }
}

export async function deleteCreative(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const { id } = req.params;
    await adService.deleteCreative(id);

    auditService
      .log({
        userId: req.user.id,
        action: "ad.creative.delete",
        entityType: "AdCreative",
        entityId: id,
        req
      })
      .catch(console.error);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Campaign handlers ────────────────────────────────────────────────────────

export async function createCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const body = campaignSchema.parse(req.body ?? {});
    if (body.endDate <= body.startDate) {
      throw new HttpError(400, "endDate must be after startDate");
    }
    const campaign = await adService.createCampaign(body);

    auditService
      .log({
        userId: req.user.id,
        action: "ad.campaign.create",
        entityType: "AdCampaign",
        entityId: campaign.id,
        metadata: { name: campaign.name },
        req
      })
      .catch(console.error);

    res.status(201).json(campaign);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function updateCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const { id } = req.params;
    const body = campaignPatchSchema.parse(req.body ?? {});
    if (Object.keys(body).length === 0) throw new HttpError(400, "At least one field required");
    const updated = await adService.updateCampaign(id, body);
    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function listCampaigns(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, pageSize } = paginationSchema.parse(req.query);
    res.json(await adService.listCampaigns({ page, pageSize }));
  } catch (err) {
    next(err);
  }
}

export async function getCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await adService.getCampaign(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function deleteCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const { id } = req.params;
    await adService.deleteCampaign(id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Placement handlers ───────────────────────────────────────────────────────

export async function createPlacement(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const body = placementSchema.parse(req.body ?? {});
    const placement = await adService.createPlacement({
      ...body,
      targetCategory: body.targetCategory ?? undefined,
      targetVideoId: body.targetVideoId ?? undefined
    });
    res.status(201).json(placement);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function listPlacements(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, pageSize } = paginationSchema.parse(req.query);
    const campaignId = z.string().optional().parse(req.query.campaignId);
    res.json(await adService.listPlacements({ page, pageSize, campaignId }));
  } catch (err) {
    next(err);
  }
}

export async function deletePlacement(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    await adService.deletePlacement(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Analytics handler ────────────────────────────────────────────────────────

export async function getAdAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const params = analyticsQuerySchema.parse(req.query);
    res.json(await adService.getAnalytics(params));
  } catch (err) {
    next(err);
  }
}
