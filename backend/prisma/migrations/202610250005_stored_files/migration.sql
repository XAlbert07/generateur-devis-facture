-- CreateTable
CREATE TABLE "fichier_stocke" (
    "reference" TEXT NOT NULL,
    "entreprise_id" UUID NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fichier_stocke_pkey" PRIMARY KEY ("reference")
);

-- CreateIndex
CREATE INDEX "fichier_stocke_entreprise_id_idx" ON "fichier_stocke"("entreprise_id");

-- AddForeignKey
ALTER TABLE "fichier_stocke" ADD CONSTRAINT "fichier_stocke_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

