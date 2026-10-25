-- CreateTable
CREATE TABLE "evenement_audit" (
    "id" UUID NOT NULL,
    "entreprise_id" UUID,
    "utilisateur_id" UUID,
    "action" TEXT NOT NULL,
    "ressource" TEXT,
    "ressource_id" TEXT,
    "requete_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenement_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evenement_audit_entreprise_id_created_at_idx" ON "evenement_audit"("entreprise_id", "created_at");

-- CreateIndex
CREATE INDEX "evenement_audit_action_created_at_idx" ON "evenement_audit"("action", "created_at");
