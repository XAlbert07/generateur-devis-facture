-- Ajustement immuabilité :
-- - UPDATE des champs métier figés si non brouillon (conservé)
-- - DELETE document : non bloqué en SQL (l’API n’autorise que les brouillons ;
--   cleanup / tests / CASCADE doivent pouvoir purger)
-- - Lignes : INSERT/UPDATE bloqués si parent non brouillon ; DELETE libre
--   (remplacement brouillon + CASCADE)

DROP TRIGGER IF EXISTS devis_immutability ON "devis";
DROP TRIGGER IF EXISTS facture_immutability ON "facture";
DROP TRIGGER IF EXISTS ligne_devis_immutability ON "ligne_devis";
DROP TRIGGER IF EXISTS ligne_facture_immutability ON "ligne_facture";

CREATE OR REPLACE FUNCTION forbid_devis_mutable_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'BROUILLON' THEN
    RETURN NEW;
  END IF;

  IF NEW.entreprise_id IS DISTINCT FROM OLD.entreprise_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.date_validite IS DISTINCT FROM OLD.date_validite
     OR NEW.remise_globale_type IS DISTINCT FROM OLD.remise_globale_type
     OR NEW.remise_globale_valeur IS DISTINCT FROM OLD.remise_globale_valeur
     OR NEW.sous_total_ht IS DISTINCT FROM OLD.sous_total_ht
     OR NEW.remise_globale IS DISTINCT FROM OLD.remise_globale
     OR NEW.total_ht_apres_remise IS DISTINCT FROM OLD.total_ht_apres_remise
     OR NEW.total_tva IS DISTINCT FROM OLD.total_tva
     OR NEW.total_ttc IS DISTINCT FROM OLD.total_ttc
     OR NEW.ventilation_tva IS DISTINCT FROM OLD.ventilation_tva
     OR NEW.envoye_le IS DISTINCT FROM OLD.envoye_le
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.snapshot_version IS DISTINCT FROM OLD.snapshot_version
     OR NEW.hash_snapshot IS DISTINCT FROM OLD.hash_snapshot
  THEN
    RAISE EXCEPTION 'devis non brouillon immuable (champs métier figés)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER devis_immutability
  BEFORE UPDATE ON "devis"
  FOR EACH ROW
  EXECUTE FUNCTION forbid_devis_mutable_fields();

CREATE OR REPLACE FUNCTION forbid_facture_mutable_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'BROUILLON' THEN
    RETURN NEW;
  END IF;

  IF NEW.entreprise_id IS DISTINCT FROM OLD.entreprise_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.devis_id IS DISTINCT FROM OLD.devis_id
     OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.origin IS DISTINCT FROM OLD.origin
     OR NEW.date_emission IS DISTINCT FROM OLD.date_emission
     OR NEW.date_echeance IS DISTINCT FROM OLD.date_echeance
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.remise_globale_type IS DISTINCT FROM OLD.remise_globale_type
     OR NEW.remise_globale_valeur IS DISTINCT FROM OLD.remise_globale_valeur
     OR NEW.sous_total_ht IS DISTINCT FROM OLD.sous_total_ht
     OR NEW.remise_globale IS DISTINCT FROM OLD.remise_globale
     OR NEW.total_ht_apres_remise IS DISTINCT FROM OLD.total_ht_apres_remise
     OR NEW.total_tva IS DISTINCT FROM OLD.total_tva
     OR NEW.total_ttc IS DISTINCT FROM OLD.total_ttc
     OR NEW.ventilation_tva IS DISTINCT FROM OLD.ventilation_tva
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.snapshot_version IS DISTINCT FROM OLD.snapshot_version
     OR NEW.hash_snapshot IS DISTINCT FROM OLD.hash_snapshot
  THEN
    RAISE EXCEPTION 'facture non brouillon immuable (champs métier figés)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD.status = 'ANNULEE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'facture annulée immuable (statut)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD.status = 'EMISE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'ANNULEE' THEN
    RAISE EXCEPTION 'transition de facture émise interdite'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER facture_immutability
  BEFORE UPDATE ON "facture"
  FOR EACH ROW
  EXECUTE FUNCTION forbid_facture_mutable_fields();

CREATE OR REPLACE FUNCTION forbid_ligne_devis_when_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status "QuoteStatus";
BEGIN
  SELECT status INTO parent_status FROM "devis" WHERE id = NEW.devis_id;
  IF parent_status IS NULL OR parent_status = 'BROUILLON' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'lignes d’un devis non brouillon immuables'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE OR REPLACE FUNCTION forbid_ligne_facture_when_frozen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status "InvoiceStatus";
BEGIN
  SELECT status INTO parent_status FROM "facture" WHERE id = NEW.facture_id;
  IF parent_status IS NULL OR parent_status = 'BROUILLON' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'lignes d’une facture non brouillon immuables'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER ligne_devis_immutability
  BEFORE INSERT OR UPDATE ON "ligne_devis"
  FOR EACH ROW
  EXECUTE FUNCTION forbid_ligne_devis_when_frozen();

CREATE TRIGGER ligne_facture_immutability
  BEFORE INSERT OR UPDATE ON "ligne_facture"
  FOR EACH ROW
  EXECUTE FUNCTION forbid_ligne_facture_when_frozen();
