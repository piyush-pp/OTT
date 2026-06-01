-- CreateEnum
CREATE TYPE "AdCreativeStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'DONE');

-- CreateEnum
CREATE TYPE "AdBreakType" AS ENUM ('PRE', 'MID', 'POST');

-- CreateEnum
CREATE TYPE "AdEventType" AS ENUM ('IMPRESSION', 'Q1', 'Q2', 'Q3', 'COMPLETE', 'SKIP', 'CLICK');

-- CreateTable
CREATE TABLE "AdCreative" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "advertiserName" TEXT NOT NULL,
    "clickUrl" TEXT,
    "skipOffsetSec" INTEGER,
    "durationSec" INTEGER NOT NULL,
    "status" "AdCreativeStatus" NOT NULL DEFAULT 'PENDING',
    "inputKey" TEXT NOT NULL,
    "hlsBasePath" TEXT,
    "thumbnailKey" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCreative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "advertiser" TEXT NOT NULL,
    "budgetCents" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdPlacement" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "breakType" "AdBreakType" NOT NULL,
    "midRollOffsetSec" INTEGER,
    "targetCategory" TEXT,
    "targetVideoId" TEXT,
    "maxAdsPerPod" INTEGER NOT NULL DEFAULT 1,
    "frequencyCapPerDay" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdImpression" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "event" "AdEventType" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdImpression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCreative_status_idx" ON "AdCreative"("status");

-- CreateIndex
CREATE INDEX "AdCampaign_status_startDate_endDate_idx" ON "AdCampaign"("status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "AdPlacement_campaignId_idx" ON "AdPlacement"("campaignId");

-- CreateIndex
CREATE INDEX "AdPlacement_creativeId_idx" ON "AdPlacement"("creativeId");

-- CreateIndex
CREATE INDEX "AdPlacement_targetCategory_idx" ON "AdPlacement"("targetCategory");

-- CreateIndex
CREATE INDEX "AdPlacement_targetVideoId_idx" ON "AdPlacement"("targetVideoId");

-- CreateIndex
CREATE INDEX "AdImpression_creativeId_event_recordedAt_idx" ON "AdImpression"("creativeId", "event", "recordedAt");

-- CreateIndex
CREATE INDEX "AdImpression_placementId_recordedAt_idx" ON "AdImpression"("placementId", "recordedAt");

-- CreateIndex
CREATE INDEX "AdImpression_videoId_recordedAt_idx" ON "AdImpression"("videoId", "recordedAt");

-- CreateIndex
CREATE INDEX "AdImpression_userId_creativeId_recordedAt_idx" ON "AdImpression"("userId", "creativeId", "recordedAt");

-- CreateIndex
CREATE INDEX "AdImpression_sessionId_idx" ON "AdImpression"("sessionId");

-- AddForeignKey
ALTER TABLE "AdPlacement" ADD CONSTRAINT "AdPlacement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdPlacement" ADD CONSTRAINT "AdPlacement_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "AdCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdImpression" ADD CONSTRAINT "AdImpression_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "AdCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdImpression" ADD CONSTRAINT "AdImpression_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
