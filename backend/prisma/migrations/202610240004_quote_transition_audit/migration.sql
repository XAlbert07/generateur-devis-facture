-- Audit des transitions de devis + horodatage de saisie d'acceptation.
ALTER TABLE "devis"
  ADD COLUMN "accepte_saisi_le" TIMESTAMPTZ(6),
  ADD COLUMN "refuse_le" TIMESTAMPTZ(6),
  ADD COLUMN "motif_refus" TEXT,
  ADD COLUMN "annule_le" TIMESTAMPTZ(6),
  ADD COLUMN "annule_par" UUID,
  ADD COLUMN "motif_annulation" TEXT;

ALTER TABLE "devis"
  ADD CONSTRAINT "devis_annule_par_fkey"
  FOREIGN KEY ("annule_par") REFERENCES "utilisateur"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
