-- Contraintes CHECK métier (§11 conception).
-- Dates d’émission/échéance : OK si l’une est nulle (brouillon).

ALTER TABLE "paiement"
  ADD CONSTRAINT "paiement_montant_positif"
  CHECK ("amount" > 0);

ALTER TABLE "ligne_devis"
  ADD CONSTRAINT "ligne_devis_quantite_positive"
  CHECK ("quantite_milli" > 0),
  ADD CONSTRAINT "ligne_devis_taux_tva_borne"
  CHECK ("taux_tva_bp" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "ligne_devis_prix_unitaire_non_negatif"
  CHECK ("prix_unitaire" >= 0);

ALTER TABLE "ligne_facture"
  ADD CONSTRAINT "ligne_facture_quantite_positive"
  CHECK ("quantite_milli" > 0),
  ADD CONSTRAINT "ligne_facture_taux_tva_borne"
  CHECK ("taux_tva_bp" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "ligne_facture_prix_unitaire_non_negatif"
  CHECK ("prix_unitaire" >= 0);

ALTER TABLE "produit"
  ADD CONSTRAINT "produit_taux_tva_borne"
  CHECK ("taux_tva_bp" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "produit_prix_unitaire_non_negatif"
  CHECK ("prix_unitaire" >= 0);

ALTER TABLE "facture"
  ADD CONSTRAINT "facture_echeance_apres_emission"
  CHECK (
    "date_emission" IS NULL
    OR "date_echeance" IS NULL
    OR "date_echeance" >= "date_emission"
  );

ALTER TABLE "entreprise"
  ADD CONSTRAINT "entreprise_delai_paiement_non_negatif"
  CHECK ("delai_paiement_jours" >= 0),
  ADD CONSTRAINT "entreprise_decimals_borne"
  CHECK ("decimals" BETWEEN 0 AND 6);
