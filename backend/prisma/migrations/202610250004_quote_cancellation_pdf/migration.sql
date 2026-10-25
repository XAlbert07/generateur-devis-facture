ALTER TABLE "devis"
  ADD COLUMN "pdf_annulation_reference" TEXT,
  ADD COLUMN "hash_pdf_annulation" CHAR(64);
