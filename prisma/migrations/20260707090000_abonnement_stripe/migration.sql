-- CreateEnum
CREATE TYPE "StatutAbonnement" AS ENUM ('EXONERE', 'ACTIF', 'IMPAYE', 'SUSPENDU', 'RESILIE');

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "impayeDepuis" TIMESTAMP(3),
ADD COLUMN     "statutAbonnement" "StatutAbonnement" NOT NULL DEFAULT 'EXONERE',
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "suspenduLe" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StripeEventTraite" (
    "id" TEXT NOT NULL,
    "recuLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEventTraite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_stripeCustomerId_key" ON "Organisation"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_stripeSubscriptionId_key" ON "Organisation"("stripeSubscriptionId");

