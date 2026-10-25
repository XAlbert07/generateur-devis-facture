-- Champs schéma secondaires (D2) :
--   Company.language : code langue ISO 639-1, défaut 'fr'
--   Quote.notes      : notes libres optionnelles sur le devis

ALTER TABLE "entreprise"
  ADD COLUMN IF NOT EXISTS "langue" VARCHAR(5) NOT NULL DEFAULT 'fr';

ALTER TABLE "devis"
  ADD COLUMN IF NOT EXISTS "notes" TEXT;
