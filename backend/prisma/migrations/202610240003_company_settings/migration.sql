ALTER TABLE "entreprise"
  ADD COLUMN "adresse" TEXT,
  ADD COLUMN "telephone" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "identifiants_fiscaux" JSONB,
  ADD COLUMN "logo_reference" TEXT,
  ADD COLUMN "logo_hash" CHAR(64),
  ADD COLUMN "taux_tva_defaut_bp" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pied_de_page_pdf" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "entreprise"
  ADD CONSTRAINT "entreprise_taux_tva_defaut_bp_check"
  CHECK ("taux_tva_defaut_bp" BETWEEN 0 AND 10000);
