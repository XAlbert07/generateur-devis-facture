-- AlterTable
ALTER TABLE "entreprise" ADD COLUMN     "sandbox_claimed_at" TIMESTAMPTZ(6),
ADD COLUMN     "sandbox_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "sandbox_ready_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "entreprise_sandbox_expires_at_idx" ON "entreprise"("sandbox_expires_at");

