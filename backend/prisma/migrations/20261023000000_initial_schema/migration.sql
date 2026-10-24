-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMINISTRATEUR', 'GESTIONNAIRE', 'COMPTABLE', 'LECTEUR');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('BROUILLON', 'ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE', 'CONVERTI', 'ANNULE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('BROUILLON', 'EMISE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "InvoiceOrigin" AS ENUM ('MANUELLE', 'DEVIS');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('POURCENTAGE', 'MONTANT_FIXE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DEVIS', 'FACTURE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('VIREMENT', 'ESPECES', 'CHEQUE', 'MOBILE_MONEY', 'CARTE', 'AUTRE');

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "doit_changer_mot_de_passe" BOOLEAN NOT NULL DEFAULT false,
    "derniere_connexion" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entreprise" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "decimals" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Ouagadougou',
    "prefixe_devis" TEXT NOT NULL DEFAULT 'DEV',
    "prefixe_facture" TEXT NOT NULL DEFAULT 'FAC',
    "delai_paiement_jours" INTEGER NOT NULL DEFAULT 30,
    "mentions_legales" TEXT,
    "conditions_paiement" TEXT,
    "coordonnees_reglement" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "entreprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membre_entreprise" (
    "id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "entreprise_id" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMINISTRATEUR',
    CONSTRAINT "membre_entreprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client" (
    "id" UUID NOT NULL,
    "entreprise_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "identifiant_fiscal" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produit" (
    "id" UUID NOT NULL,
    "entreprise_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prix_unitaire" BIGINT NOT NULL,
    "unite" TEXT NOT NULL DEFAULT 'unité',
    "taux_tva_bp" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "produit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devis" (
    "id" UUID NOT NULL,
    "entreprise_id" UUID NOT NULL,
    "client_id" UUID,
    "number" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'BROUILLON',
    "date_validite" DATE,
    "currency" CHAR(3) NOT NULL,
    "remise_globale_type" "DiscountType",
    "remise_globale_valeur" BIGINT,
    "sous_total_ht" BIGINT NOT NULL DEFAULT 0,
    "remise_globale" BIGINT NOT NULL DEFAULT 0,
    "total_ht_apres_remise" BIGINT NOT NULL DEFAULT 0,
    "total_tva" BIGINT NOT NULL DEFAULT 0,
    "total_ttc" BIGINT NOT NULL DEFAULT 0,
    "ventilation_tva" JSONB,
    "envoye_le" TIMESTAMPTZ(6),
    "date_acceptation" DATE,
    "snapshot" JSONB,
    "snapshot_version" INTEGER,
    "hash_snapshot" TEXT,
    "pdf_reference" TEXT,
    "hash_pdf" CHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_devis" (
    "id" UUID NOT NULL,
    "devis_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "designation" TEXT NOT NULL,
    "quantite_milli" BIGINT NOT NULL,
    "prix_unitaire" BIGINT NOT NULL,
    "remise_type" "DiscountType",
    "remise_valeur" BIGINT,
    "taux_tva_bp" INTEGER NOT NULL,
    "gross" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL,
    "net" BIGINT NOT NULL,
    CONSTRAINT "ligne_devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facture" (
    "id" UUID NOT NULL,
    "entreprise_id" UUID NOT NULL,
    "client_id" UUID,
    "devis_id" UUID,
    "number" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'BROUILLON',
    "origin" "InvoiceOrigin" NOT NULL DEFAULT 'MANUELLE',
    "date_emission" DATE,
    "date_echeance" DATE,
    "currency" CHAR(3) NOT NULL,
    "sous_total_ht" BIGINT NOT NULL DEFAULT 0,
    "remise_globale" BIGINT NOT NULL DEFAULT 0,
    "total_ht_apres_remise" BIGINT NOT NULL DEFAULT 0,
    "total_tva" BIGINT NOT NULL DEFAULT 0,
    "total_ttc" BIGINT NOT NULL DEFAULT 0,
    "ventilation_tva" JSONB,
    "snapshot" JSONB,
    "snapshot_version" INTEGER,
    "hash_snapshot" TEXT,
    "pdf_reference" TEXT,
    "hash_pdf" CHAR(64),
    "pdf_annulation_reference" TEXT,
    "hash_pdf_annulation" CHAR(64),
    "annule_le" TIMESTAMPTZ(6),
    "annule_par" UUID,
    "motif_annulation" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_facture" (
    "id" UUID NOT NULL,
    "facture_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "designation" TEXT NOT NULL,
    "quantite_milli" BIGINT NOT NULL,
    "prix_unitaire" BIGINT NOT NULL,
    "remise_type" "DiscountType",
    "remise_valeur" BIGINT,
    "taux_tva_bp" INTEGER NOT NULL,
    "gross" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL,
    "net" BIGINT NOT NULL,
    CONSTRAINT "ligne_facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiement" (
    "id" UUID NOT NULL,
    "facture_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "date_paiement" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "cle_idempotence" TEXT NOT NULL,
    "empreinte_requete" CHAR(64) NOT NULL,
    "cle_idempotence_expire_le" TIMESTAMPTZ(6) NOT NULL,
    "cree_par" UUID NOT NULL,
    "annule_le" TIMESTAMPTZ(6),
    "annule_par" UUID,
    "motif_annulation" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_document" (
    "entreprise_id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "annee" INTEGER NOT NULL,
    "dernier_numero" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "sequence_document_pkey" PRIMARY KEY ("entreprise_id", "type", "annee")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");
CREATE UNIQUE INDEX "membre_entreprise_utilisateur_id_entreprise_id_key" ON "membre_entreprise"("utilisateur_id", "entreprise_id");
CREATE INDEX "client_entreprise_id_name_idx" ON "client"("entreprise_id", "name");
CREATE INDEX "produit_entreprise_id_name_idx" ON "produit"("entreprise_id", "name");
CREATE INDEX "devis_entreprise_id_status_idx" ON "devis"("entreprise_id", "status");
CREATE INDEX "devis_entreprise_id_client_id_idx" ON "devis"("entreprise_id", "client_id");
CREATE UNIQUE INDEX "devis_entreprise_id_number_key" ON "devis"("entreprise_id", "number");
CREATE UNIQUE INDEX "ligne_devis_devis_id_position_key" ON "ligne_devis"("devis_id", "position");
CREATE UNIQUE INDEX "facture_devis_id_key" ON "facture"("devis_id");
CREATE INDEX "facture_entreprise_id_status_idx" ON "facture"("entreprise_id", "status");
CREATE INDEX "facture_entreprise_id_client_id_idx" ON "facture"("entreprise_id", "client_id");
CREATE INDEX "facture_entreprise_id_date_emission_idx" ON "facture"("entreprise_id", "date_emission");
CREATE UNIQUE INDEX "facture_entreprise_id_number_key" ON "facture"("entreprise_id", "number");
CREATE UNIQUE INDEX "ligne_facture_facture_id_position_key" ON "ligne_facture"("facture_id", "position");
CREATE INDEX "paiement_facture_id_date_paiement_idx" ON "paiement"("facture_id", "date_paiement");
CREATE INDEX "paiement_facture_id_cle_idempotence_cle_idempotence_expire__idx" ON "paiement"("facture_id", "cle_idempotence", "cle_idempotence_expire_le");

-- AddForeignKey
ALTER TABLE "membre_entreprise" ADD CONSTRAINT "membre_entreprise_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membre_entreprise" ADD CONSTRAINT "membre_entreprise_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client" ADD CONSTRAINT "client_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "produit" ADD CONSTRAINT "produit_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devis" ADD CONSTRAINT "devis_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devis" ADD CONSTRAINT "devis_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_devis" ADD CONSTRAINT "ligne_devis_devis_id_fkey" FOREIGN KEY ("devis_id") REFERENCES "devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facture" ADD CONSTRAINT "facture_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facture" ADD CONSTRAINT "facture_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facture" ADD CONSTRAINT "facture_devis_id_fkey" FOREIGN KEY ("devis_id") REFERENCES "devis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "facture" ADD CONSTRAINT "facture_annule_par_fkey" FOREIGN KEY ("annule_par") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ligne_facture" ADD CONSTRAINT "ligne_facture_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_cree_par_fkey" FOREIGN KEY ("cree_par") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_annule_par_fkey" FOREIGN KEY ("annule_par") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sequence_document" ADD CONSTRAINT "sequence_document_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
