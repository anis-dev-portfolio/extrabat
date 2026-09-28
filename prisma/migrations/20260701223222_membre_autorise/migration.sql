-- CreateTable
CREATE TABLE "MembreAutorise" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CONDUCTEUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "MembreAutorise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembreAutorise_email_key" ON "MembreAutorise"("email");

-- CreateIndex
CREATE INDEX "MembreAutorise_organisationId_idx" ON "MembreAutorise"("organisationId");

-- AddForeignKey
ALTER TABLE "MembreAutorise" ADD CONSTRAINT "MembreAutorise_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
