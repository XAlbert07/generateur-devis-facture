# Conception du projet — Générateur de devis et factures

*Version 2.0 — 23 octobre 2026. Cette version remplace la v1 et intègre les décisions issues des relectures successives : calcul monétaire, numérotation, machines à états, concurrence, PDF, sécurité et périmètre.*

## Décisions structurantes

| Sujet | Décision |
| --- | --- |
| Montants | Entiers en plus petite unité de la devise (BIGINT), calculs en bigint de bout en bout, jamais de flottant ; chaînes décimales dans le JSON |
| Quantités | Entiers en milli-unités (3 décimales) |
| Taux | Points de base entiers (10000 = 100 %) |
| Remise globale | Répartie entre les taux de TVA par la méthode du plus fort reste |
| Numérotation | Attribuée à l’envoi du devis et à l’émission de la facture, par une table de séquences verrouillée ; remise à zéro chaque année |
| Statuts | Séparation explicite des états stockés et des états calculés |
| Facture émise | Immuable ; instantané pris à l’émission ; PDF stocké |
| Annulation | Une facture avec au moins un paiement valide ne s’annule pas dans le MVP (l’avoir est en v2) |
| Conversion devis → facture | Une facture par devis ; verrou sur le devis et contrainte d’unicité |
| Paiements | Verrou sur la facture et clé d’idempotence |
| Isolation entre entreprises | Filtre `entreprise_id` imposé par une extension du client Prisma |
| Aspects légaux | Pays cible à fixer et à vérifier auprès de l’administration avant toute mise en production |

## 1. Contexte, problème et objectifs

Une petite entreprise, un artisan ou un indépendant prépare souvent ses devis dans Word, Excel ou sur papier. À chaque document, il ressaisit les coordonnées du client, recalcule les montants et produit un PDF à la main. Les erreurs de calcul, les doublons de numéros et les factures impayées oubliées en découlent.

L’application est une application web qui fiabilise le cycle de facturation : gérer les clients et le catalogue, créer des devis, les convertir en factures, enregistrer les paiements et produire des PDF professionnels. Noms provisoires : DevisPro, FactureFlow ou GestionDevis.

**Objectifs**

- éviter les erreurs de calcul sur les quantités, remises et taxes ;
- garantir l’unicité et la continuité de la numérotation ;
- conserver les clients et le catalogue ;
- identifier les factures impayées et en retard ;
- uniformiser les documents produits ;
- garder le lien entre un devis et sa facture ;
- constituer un projet solide pour un portfolio.

**Critères de réussite vérifiables**

- aucun écart sur un jeu de référence de cas de calcul, cas limites du §5.8 compris ;
- aucun doublon ni trou de numéro lors d’un test de créations concurrentes ;
- une seule facture possible par devis sous requêtes simultanées ;
- un total identique à l’écran et dans le PDF ;
- un utilisateur d’une entreprise ne peut lire aucune donnée d’une autre (test automatisé pour chaque ressource).

## 2. Périmètre

**Inclus dans le MVP**

| Domaine | Fonctions |
| --- | --- |
| Entreprise | Nom, logo, adresse, téléphone, e-mail, identifiants fiscaux et mentions légales configurables, devise, fuseau horaire, préfixes de numérotation, délai de paiement, conditions et coordonnées de règlement (banque, mobile money, etc.) |
| Clients | Création, modification, recherche, consultation, archivage |
| Produits et services | Nom, description, prix unitaire, unité, taux de taxe, archivage |
| Devis | Brouillon, lignes, remises, calcul, envoi, acceptation, refus, annulation, PDF |
| Factures | Création manuelle ou depuis un devis accepté, émission, annulation (sous conditions), PDF |
| Paiements | Enregistrement, annulation par marquage, solde calculé |
| Tableau de bord | Facturé, encaissé, impayés, retards, devis en attente |
| Sécurité | Authentification, mots de passe hachés, isolation des données par entreprise |

**Hors MVP (v2)** : avoirs, acomptes, plusieurs factures pour un même devis, paiement en ligne, envoi automatique d’e-mails (donc vérification d’adresse et réinitialisation par lien), gestion de stock, factures récurrentes, utilisateurs multiples exposés dans l’interface, multi-devises, internationalisation, facturation électronique normalisée, statistiques avancées, application mobile, Row-Level Security PostgreSQL.

## 3. Utilisateurs et rôles

Le modèle de données prévoit dès le départ plusieurs membres par entreprise et quatre rôles. Dans le MVP, seul le rôle Administrateur est exposé : l’inscription crée l’utilisateur, l’entreprise et son appartenance dans une même transaction.

| Rôle | Responsabilités |
| --- | --- |
| Administrateur | Paramètres de l’entreprise, membres, toutes les données |
| Gestionnaire | Clients, produits, devis, factures |
| Comptable | Consultation des factures, enregistrement et annulation des paiements |
| Lecteur | Consultation seule |

Une matrice rôle × action sera écrite avant l’ouverture de ces rôles en v2.

## 4. Parcours principal

```text
Connexion
   ↓
Création ou sélection du client
   ↓
Brouillon de devis : lignes, remises, calcul automatique
   ↓
Envoi du devis  →  numéro attribué, PDF figé
   ↓
Devis accepté (date d’acceptation saisie)
   ↓
Conversion  →  brouillon de facture aux lignes verrouillées
   ↓
Émission  →  numéro attribué, instantané pris, PDF stocké
   ↓
Enregistrement des paiements  →  solde calculé
```

## 5. Représentation des nombres et spécification du calcul

C’est le cœur du produit : cette section est écrite avant le code et sert de référence aux tests.

### 5.1 Représentation

- Montants : entiers dans la plus petite unité de la devise (0 décimale pour le XOF, 2 pour l’EUR ou l’USD), stockés en BIGINT.
- Quantités : entiers en milli-unités (1,5 s’écrit 1500), BIGINT, strictement positifs.
- Taux de TVA et remises en pourcentage : points de base entiers, avec 0 ≤ bp ≤ 10000.
- Aucun flottant, y compris dans les intermédiaires. Le module de calcul manipule des bigint de bout en bout ; la conversion en chaîne se fait aux frontières (JSON, PDF).
- Prisma renvoie les BIGINT sous forme de bigint, que `JSON.stringify` refuse : l’API sérialise donc les montants en chaînes décimales (par exemple `'22026'`).

### 5.2 Fonction d’arrondi

`roundHalfUpDiv(a, b, c)` renvoie l’arrondi à l’entier le plus proche, moitié vers le haut, de a × b / c, pour a ≥ 0, b ≥ 0 et c > 0. Les facteurs sont passés séparément et jamais sous forme de produit déjà calculé : aucun intermédiaire ne repasse par un nombre flottant ou un entier de 53 bits.

```ts
function roundHalfUpDiv(a: bigint, b: bigint, c: bigint): bigint {
  if (c <= 0n || a < 0n || b < 0n) throw new RangeError('arguments invalides');
  return (2n * a * b + c) / (2n * c);
}
```

Une seule fonction, testée par propriétés, utilisée partout.

### 5.3 Ordre des opérations

Pour chaque ligne i :

1. `brut_i = roundHalfUpDiv(quantite_milli_i, prix_unitaire_i, 1000)`
2. `remise_i` : en pourcentage, `roundHalfUpDiv(brut_i, remise_bp_i, 10000)` ; en montant fixe, le montant saisi. Contrainte : 0 ≤ remise\_i ≤ brut\_i.
3. `net_i = brut_i − remise_i`

Regroupement par taux de TVA :

4. `base_T` = somme des `net_i` des lignes de taux T ; `sous_total_ht` = somme des `base_T`.

Remise globale :

5. `remise_globale` : en pourcentage, `roundHalfUpDiv(sous_total_ht, bp, 10000)` ; en montant fixe, le montant saisi. Contrainte : 0 ≤ remise\_globale ≤ sous\_total\_ht.
6. Répartition entre les taux par la méthode du plus fort reste (§5.4) : `remise_T`.
7. `base_net_T = base_T − remise_T`.

TVA et totaux :

8. `tva_T = roundHalfUpDiv(base_net_T, taux_bp_T, 10000)`
9. `total_tva` = somme des `tva_T` ; `total_ht_apres_remise = sous_total_ht − remise_globale` ; `total_ttc = total_ht_apres_remise + total_tva`.

### 5.4 Répartition de la remise globale : plus fort reste

Notations : S = `sous_total_ht`, R = `remise_globale`. Si S = 0, toutes les remises par taux valent 0.

1. Pour chaque taux T : `q_T = R × base_T` ; `floor_T = q_T div S` ; `reste_T = q_T − floor_T × S` (donc 0 ≤ reste\_T ≤ S − 1).
2. `remaining = R − Σ floor_T`.
3. Trier les taux par reste décroissant, puis par base décroissante, puis par taux croissant (ordre total, donc déterministe).
4. Les `remaining` premiers taux reçoivent une unité de plus. Le résultat est `remise_T = floor_T (+ 1)`.

**Preuve des garanties**

- *Somme exacte.* Σ remise\_T = Σ floor\_T + remaining = R.
- *Les unités vont à des restes strictement positifs.* Σ reste\_T = R × S − S × Σ floor\_T = remaining × S. Si au plus `remaining` taux avaient un reste positif, la somme serait au plus remaining × (S − 1), strictement inférieure à remaining × S : contradiction. Il y a donc plus de `remaining` taux à reste positif, et les `remaining` premiers du tri en font tous partie.
- *Pas de dépassement de la base.* Un taux à reste positif vérifie floor\_T < q\_T / S ≤ base\_T (car R ≤ S), donc floor\_T + 1 ≤ base\_T. Un taux sans unité supplémentaire vérifie floor\_T ≤ base\_T. Donc 0 ≤ remise\_T ≤ base\_T.

### 5.5 Invariants à tester par propriétés

Ces égalités sont exactes, sans tolérance :

1. Σ net\_i = sous\_total\_ht.
2. 0 ≤ remise\_T ≤ base\_T pour chaque taux (invariant non trivial, à tester avec au moins trois taux et des remises proches du sous-total).
3. Σ remise\_T = remise\_globale.
4. Σ base\_net\_T = sous\_total\_ht − remise\_globale.
5. total\_ttc = sous\_total\_ht − remise\_globale + total\_tva.
6. total\_ttc = Σ base\_net\_T + Σ tva\_T.

Toute violation est un bug bloquant.

### 5.6 Exemple chiffré : EUR, deux taux, remise globale

Montants en centimes.

| Ligne | Quantité (milli) | PU | Brut | Remise ligne | Net | TVA |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | 1000 | 10 000 | 10 000 | 0 | 10 000 | 20 % |
| L2 | 1000 | 5 000 | 5 000 | 0 | 5 000 | 10 % |
| L3 | 2000 | 2 500 | 5 000 | 5 % soit 250 | 4 750 | 20 % |

Bases : base\_10 = 5 000 ; base\_20 = 14 750 ; S = 19 750. Remise globale R = 1 000.

| Taux | q = R × base | floor | reste |
| --- | --- | --- | --- |
| 10 % | 5 000 000 | 253 | 3 250 |
| 20 % | 14 750 000 | 746 | 16 500 |

`remaining = 1 000 − 999 = 1`, attribué au taux 20 % (plus fort reste) : `remise_10 = 253`, `remise_20 = 747`. Bases nettes : 4 747 et 14 003 (somme 18 750 = 19 750 − 1 000).

TVA : `tva_10 = 475`, `tva_20 = 2 801`, `total_tva = 3 276`. Total TTC : 18 750 + 3 276 = **22 026** (220,26 €).

Affichage sur le PDF :

```text
Sous-total HT                 197,50 €
Remise globale                −10,00 €
Total HT après remise         187,50 €
TVA 10 % sur 47,47 €            4,75 €
TVA 20 % sur 140,03 €          28,01 €
Total TVA                      32,76 €
TOTAL TTC                     220,26 €
```

### 5.7 Exemple chiffré : XOF, taux unique

L1 : 3 × 1 000 = 3 000 ; L2 : 1 × 2 500 = 2 500, toutes deux à 18 %. S = 5 500. Remise globale de 10 % : `roundHalfUpDiv(5500, 1000, 10000) = 550`. Base nette 4 950, TVA 891, total TTC **5 841** F.

### 5.8 Cas limites à tester

- Remise globale nulle, égale au sous-total ; ligne à zéro.
- Un seul taux ; taux à 0 % ; plusieurs taux dont un à 0 %.
- Trois taux ou plus avec plusieurs unités de reste à distribuer.
- **Contre-exemple de référence** : cinq taux de base 1 chacun et une remise de 2 donnent `[1, 1, 0, 0, 0]` dans l’ordre des taux croissants, sans jamais dépasser une base.
- Quantité décimale (1,5 × 19,99) ; très grands montants (vérification du passage en bigint).
- Résultat indépendant de l’ordre des lignes.
- Les valeurs reconstruites depuis les totaux affichés redonnent exactement celles de l’écran.

### 5.9 Emplacement du code

Un seul module `shared/money/` : le type `Money`, `roundHalfUpDiv`, la fonction pure `computeDocumentTotals(lignes, remiseGlobale, decimales)`, et ses tests. Devis, factures et rendu PDF l’appellent ; aucune duplication.

## 6. Numérotation des documents

- Format : `{préfixe}-{année}-{numéro sur 4 chiffres minimum}`, par exemple `DEV-2026-0001` et `FAC-2026-0001`. Au-delà de 9999, le numéro s’allonge.
- L’année est l’année civile de la date d’envoi ou d’émission, dans le fuseau horaire de l’entreprise. La séquence repart à 0001 chaque année.
- **Un brouillon n’a pas de numéro.** Le numéro est attribué à l’envoi du devis et à l’émission de la facture.
- Table `SEQUENCE_DOCUMENT (entreprise_id, type, annee, dernier_numero)` avec `UNIQUE (entreprise_id, type, annee)` ; `type` vaut `devis` ou `facture`. C’est l’unique source de vérité : aucune colonne de compteur sur l’entreprise.

Attribution, dans la transaction qui fait passer le document à l’état envoyé ou émis :

1. `INSERT … ON CONFLICT DO NOTHING` de la ligne de séquence (valeur 0), puis `SELECT … FOR UPDATE` sur cette ligne.
2. `nouveau = dernier_numero + 1` ; `UPDATE` de la séquence.
3. Formatage du numéro et écriture du document avec ce numéro, dans la même transaction.

Conséquences : un échec ne consomme aucun numéro, donc aucun trou en fonctionnement normal. Un document annulé garde son numéro et reste consultable avec la mention « ANNULÉ ». Le rendu du PDF se fait hors de la transaction, afin de ne pas conserver le verrou de séquence pendant la génération. Chaque table de document porte `UNIQUE (entreprise_id, numero)` ; la colonne est nulle tant que le document est un brouillon, ce que PostgreSQL autorise.

## 7. États et transitions d’un devis

**États stockés** : `brouillon`, `envoye`, `accepte`, `refuse`, `converti`, `annule`.

**État calculé** : `expire`, affiché quand le statut est `envoye` et que la date de validité est dépassée (fuseau de l’entreprise). Il n’est jamais stocké.

Un brouillon est modifiable, lit les données courantes de l’entreprise et du client, n’a pas de numéro et peut être supprimé physiquement. **À l’envoi**, le service vérifie la présence d’un client et d’au moins une ligne, recalcule les totaux, attribue le numéro (§6), prend l’instantané (entreprise, client, conditions, devise, lignes, totaux), calcule `hash_snapshot` et stocke le PDF. Un devis envoyé est immuable : pour le corriger, on l’annule et on en crée un nouveau.

| De | Action | Vers | Conditions | Effets |
| --- | --- | --- | --- | --- |
| brouillon | `delete` | supprimé | jamais envoyé | suppression physique |
| brouillon | `send` | envoye | client, au moins une ligne | numéro, instantané, PDF stocké, `envoye_le` |
| envoye | `accept` | accepte | date d’acceptation valide (ci-dessous) | `date_acceptation`, `accepte_saisi_le` |
| envoye | `refuse` | refuse | aucune | `refuse_le`, motif facultatif |
| envoye | `cancel` | annule | rôle Administrateur ou Gestionnaire | `annule_le`, `annule_par`, motif |
| accepte | `convert` | converti | voir §9 | brouillon de facture créé |
| accepte | `cancel` | annule | aucune facture liée | idem |
| refuse, converti, annule | — | terminal | — | — |

Un devis `converti` ne revient à `accepte` que si le brouillon de facture dont il est l’origine est supprimé (§9).

**Acceptation datée.** L’utilisateur saisit la date réelle d’acceptation, qui peut précéder le jour de saisie (accord téléphonique enregistré quelques jours plus tard). L’action est valide si `date_envoi ≤ date_acceptation ≤ min(date_validite, aujourd’hui)`. Le jour de saisie ne bloque donc pas l’acceptation. Deux champs sont conservés : `date_acceptation` (date déclarée) et `accepte_saisi_le` (horodatage réel de la saisie), afin que tout antidatage reste traçable. Un devis expiré peut être refusé ou annulé.

## 8. États d’une facture, paiements et annulation

**États stockés** : `brouillon`, `emise`, `annulee`.

**Situation de paiement, calculée à la lecture** (aucune tâche de mise à jour) à partir de `solde = total_ttc − somme des paiements valides`, de l’échéance et de la date du jour :

| Condition (facture émise) | Affichage |
| --- | --- |
| solde = total et échéance non dépassée | en attente |
| 0 < solde < total et échéance non dépassée | partiellement payée |
| solde > 0 et échéance dépassée | en retard (« partiellement payée » si solde < total) |
| solde = 0 | payée |

**Brouillon.** Origine `manuelle` : entièrement modifiable. Origine `devis` : les lignes copiées sont en lecture seule (ni ajout, ni suppression, ni modification), de même que le client et la devise, afin que la facture porte exactement le montant accepté. Un brouillon lit les données courantes, n’a pas de numéro et peut être supprimé.

**Émission.** Conditions : au moins une ligne, un client, totaux recalculés. Dans une seule transaction :

1. attribution du numéro (§6) ;
2. instantané complet : entreprise, client, lignes, totaux, conditions, devise, coordonnées de règlement, mentions légales ;
3. `snapshot_version`, `hash_snapshot` (SHA-256 de la forme canonique RFC 8785, montants écrits en chaînes) ;
4. `date_emission` ; `date_echeance = date_emission + délai de paiement` (modifiable sur le brouillon).

Le rendu du PDF suit hors transaction (§13).

| De | Action | Vers | Conditions | Effets |
| --- | --- | --- | --- | --- |
| brouillon | `delete` | supprimé | jamais émise | si origine devis : le devis repasse de `converti` à `accepte`, dans la même transaction |
| brouillon | `issue` | emise | voir ci-dessus | numéro, instantané, hachage |
| emise | `add_payment` | emise | verrou ; montant > 0 ; somme des paiements + montant ≤ total | paiement créé |
| emise | `cancel_payment` | emise | verrou ; paiement valide existant | paiement marqué annulé |
| emise | `cancel` | annulee | verrou ; aucun paiement valide | `annule_le`, `annule_par`, motif, second PDF « ANNULÉE » |
| emise | `cancel` | refusé (409) | au moins un paiement valide | message : un avoir est requis (v2) |
| annulee | — | terminal | — | — |

Une facture émise n’est jamais supprimée ni modifiée. Si votre pays cible impose un avoir même pour une facture non payée, la règle d’annulation change : voir §17.

**Paiements.** Montant strictement positif, date, mode (`virement`, `especes`, `cheque`, `mobile_money`, `carte`, `autre`), référence, auteur. Un paiement erroné est annulé par marquage (`annule_le`, `annule_par`, motif), jamais supprimé.

**Concurrence.** `add_payment`, `cancel_payment` et `cancel` commencent tous par `SELECT … FOR UPDATE` sur la ligne de la facture, puis vérifient l’état et le solde. Sans ce verrou commun, un paiement et une annulation simultanés pourraient laisser une facture annulée portant un paiement valide.

**Idempotence des paiements.** L’en-tête `Idempotency-Key` est obligatoire sur la création d’un paiement. La clé est insérée dans la même transaction que le paiement. Le front-end génère la clé à l’ouverture du formulaire, et non au clic, et la réutilise en cas de nouvel essai. Même clé et même empreinte de requête : réponse stockée renvoyée ; même clé et empreinte différente : 409 ; clé absente : 400 ; durée de vie : 24 heures.

## 9. Conversion d’un devis en facture

- Seul un devis `accepte` se convertit. Un devis produit une seule facture, garantie par `UNIQUE (facture.devis_id)` (colonne nulle pour les factures manuelles).
- Transaction de conversion :
  1. `SELECT … FOR UPDATE` sur la ligne du devis ;
  2. si le devis est déjà `converti` : renvoyer la facture existante (200), sans rien créer ;
  3. s’il est `accepte` : créer un brouillon de facture d’origine `devis`, aux lignes copiées et verrouillées, passer le devis à `converti`, valider (201) ;
  4. dans tout autre état : 409.
- Le verrou fait attendre la requête concurrente, qui voit `converti` et renvoie la facture existante : le fonctionnement normal ne repose pas sur une exception. La contrainte d’unicité reste un filet de sécurité ; si une violation survient malgré tout (erreur Prisma `P2002`), la transaction est perdue et la facture existante est relue dans une nouvelle transaction.
- Aucune table d’idempotence pour cette route : verrou et contrainte suffisent.
- Annuler la facture issue d’un devis laisse le devis `converti`. Décision assumée : pour refacturer, on crée une facture manuelle ou un nouveau devis.
- Les factures d’acompte, les livraisons partielles et plusieurs factures par devis sont des évolutions futures.

## 10. Suppression, archivage et annulation

| Entité | Suppression physique | Archivage | Annulation |
| --- | --- | --- | --- |
| Client, produit | jamais s’ils sont référencés | `archived_at` ; exclus des nouvelles saisies | — |
| Devis brouillon jamais envoyé | oui | — | — |
| Devis envoyé, accepté, refusé, converti | non | — | `annule` si applicable |
| Facture brouillon | oui | — | — |
| Facture émise | non | — | `annulee` sous conditions |
| Paiement | non | — | marquage |

## 11. Modèle de données

**Conventions.** Identifiants UUID. Horodatages en UTC (`created_at`, `updated_at`). `version` (entier) pour le verrouillage optimiste sur clients, produits, devis et factures. Montants et quantités en BIGINT, taux en INTEGER (points de base). Dates calendaires dans le fuseau de l’entreprise (`timezone`).

```text
UTILISATEUR (id, nom, email UNIQUE, password_hash, doit_changer_mot_de_passe,
             mot_de_passe_change_le, tentatives_echec, verrouille_jusqua,
             derniere_connexion)

ENTREPRISE (id, nom, logo_ref, adresse, telephone, email, identifiants_fiscaux JSONB,
            mentions_legales, pied_de_page_pdf, devise, decimales, timezone, langue,
            taux_tva_defaut_bp, prefixe_devis, prefixe_facture, delai_paiement_jours,
            conditions_paiement, coordonnees_reglement)

MEMBRE_ENTREPRISE (id, utilisateur_id, entreprise_id, role,
                   UNIQUE (utilisateur_id, entreprise_id))

CLIENT  (id, entreprise_id, nom, email, telephone, adresse, identifiant_fiscal,
         archived_at, version)
PRODUIT (id, entreprise_id, nom, description, prix_unitaire, unite, taux_tva_bp,
         archived_at, version)

DEVIS (id, entreprise_id, client_id, numero NULL, statut, date_validite, devise, notes,
       conditions_paiement, remise_globale_type, remise_globale_valeur,
       sous_total_ht, remise_globale, total_ht_apres_remise, total_tva, total_ttc,
       ventilation_tva JSONB, envoye_le, date_acceptation, accepte_saisi_le,
       refuse_le, motif_refus, annule_le, annule_par, motif_annulation,
       snapshot JSONB, snapshot_version, hash_snapshot, pdf_reference, hash_pdf, version,
       UNIQUE (entreprise_id, numero))

LIGNE_DEVIS (id, devis_id, position, designation, quantite_milli, prix_unitaire,
             remise_type, remise_valeur, taux_tva_bp, brut, remise, net)

FACTURE (id, entreprise_id, client_id, devis_id NULL UNIQUE, origine, numero NULL, statut,
         date_emission, date_echeance, devise, [mêmes champs de totaux et de remise],
         annule_le, annule_par, motif_annulation, snapshot JSONB, snapshot_version,
         hash_snapshot, pdf_reference, hash_pdf, pdf_annulation_reference, version,
         UNIQUE (entreprise_id, numero))

LIGNE_FACTURE (mêmes colonnes que LIGNE_DEVIS, avec facture_id)

PAIEMENT (id, facture_id, montant, date_paiement, mode, reference, cree_par,
          annule_le, annule_par, motif_annulation)

SEQUENCE_DOCUMENT (entreprise_id, type, annee, dernier_numero,
                   UNIQUE (entreprise_id, type, annee))

IDEMPOTENCY_KEY (cle, entreprise_id, endpoint, request_hash, response_status,
                 response_body, created_at, expires_at, UNIQUE (entreprise_id, cle))

REFRESH_TOKEN (id, utilisateur_id, token_hash, expires_at, revoque_le, remplace_par,
               user_agent, ip)

EVENEMENT_AUDIT (id, entreprise_id, utilisateur_id, action, ressource_type,
                 ressource_id, cree_le, details JSONB)
```

**Instantané.** Le JSON canonique contient l’entreprise, le client, les conditions, la devise, les lignes, les totaux et la ventilation de TVA. Les lignes restent aussi dans leurs tables, pour les requêtes ; elles sont immuables après l’envoi ou l’émission.

**Contraintes.** `CHECK (montant > 0)` sur les paiements ; `CHECK (quantite_milli > 0)` ; `CHECK (taux_tva_bp BETWEEN 0 AND 10000)` ; `CHECK (date_echeance >= date_emission)` ; clés étrangères en `ON DELETE RESTRICT` pour les documents. L’immuabilité des documents envoyés ou émis est imposée par le service, et peut être doublée par un déclencheur de base de données.

**Index.** `(entreprise_id, statut)` et `(entreprise_id, client_id)` sur devis et factures ; `(entreprise_id, date_emission)` sur les factures ; `(facture_id, date_paiement)` sur les paiements ; index trigramme sur les noms de clients et de produits.

**Migrations.** Prisma Migrate, en avant seulement ; chaque migration est essayée sur une copie des données avant la production.

## 12. Architecture technique et décisions

```text
Navigateur
   ↓
Application React + TypeScript
   ↓ API REST sécurisée
Serveur Node.js / Express + TypeScript
   ↓                       ↓
PostgreSQL (Prisma)     Stockage objet (PDF, logos)
```

**Pile retenue.** Front-end : React, TypeScript, React Router, React Hook Form et Zod, appels API isolés dans une couche dédiée. Back-end : Node.js, Express, Prisma, PostgreSQL, Zod, PDFKit. Tests : Vitest, fast-check, Supertest, Testcontainers, Playwright.

**Organisation du code.** Modules par domaine (`auth`, `entreprises`, `clients`, `produits`, `devis`, `factures`, `paiements`) et un dossier `shared/` (`money`, `pdf`, `errors`, `validation`). Les modules à logique riche (devis, factures, paiements) séparent routes, contrôleur, service, repository, validation et rendu PDF. Les modules simples (clients, produits) se limitent à des routes, un service et un accès Prisma direct : pas d’interface de repository sans besoin. Le calculateur est unique, dans `shared/money/`, et compilé pour le serveur comme pour le navigateur : l’écran et le PDF ne peuvent pas diverger. Les contrôleurs n’accèdent ni à Prisma ni à PDFKit. La limite de 200 lignes par fichier est un repère de découpage, pas une règle absolue ; un dépassement se justifie en revue.

**Orienté objet, de façon pragmatique.** Petits types immuables (`Money`, `DocumentNumber`, transitions d’état) et interfaces là où elles servent (`PdfRenderer`, repository des factures) ; calculs et validations en fonctions pures ; ni classe géante, ni héritage inutile.

### Décisions d’architecture

**ADR-1 · Représentation monétaire.** *Options* : entiers, type décimal (Prisma Decimal, decimal.js), bibliothèque dédiée. *Décision* : entiers bigint et une fonction d’arrondi unique. *Ce que l’on perd* : formatage et sérialisation à écrire soi-même.

**ADR-2 · Numérotation.** *Options* : `MAX(numero) + 1`, séquence PostgreSQL par entreprise, table de compteurs verrouillée. *Décision* : table de compteurs et `SELECT … FOR UPDATE` (le calcul du maximum est exposé aux accès concurrents ; une séquence PostgreSQL n’est pas annulée avec la transaction et crée des trous). *Ce que l’on perd* : les émissions d’une même entreprise passent l’une après l’autre, ce qui est sans conséquence à ce volume.

**ADR-3 · Instantané et PDF.** *Options* : régénérer depuis les données vivantes, instantané seul, instantané et PDF stocké. *Décision* : instantané JSON canonique et PDF stocké à l’émission, jamais régénéré. *Ce que l’on perd* : un stockage objet, une procédure de réparation et le versionnement du schéma d’instantané.

**ADR-4 · Authentification.** *Options* : JWT seul, sessions serveur, jeton court et refresh. *Décision* : accès 15 minutes, refresh 7 jours avec rotation et détection de réutilisation, table `REFRESH_TOKEN`, cookies `HttpOnly`. *Ce que l’on perd* : un état côté serveur et la complexité de la rotation.

**ADR-5 · Isolation entre entreprises.** *Options* : filtre écrit à la main, extension du client Prisma, Row-Level Security PostgreSQL. *Décision* : extension qui impose `entreprise_id` à chaque requête, plus des tests d’isolation pour chaque ressource ; la RLS reste une évolution (avec Prisma, elle exige un `SET LOCAL` à chaque transaction). *Ce que l’on perd* : une garantie moins forte qu’une règle appliquée par la base.

## 13. Génération des PDF

- PDFKit, avec polices embarquées (accents, symboles monétaires). Le tableau est dessiné à la main : sauts de page et répétition de l’en-tête de colonnes sont à prototyper dès la phase 0.
- **Facture** : logo et coordonnées de l’entreprise, mention FACTURE, numéro, dates d’émission et d’échéance, client, tableau (désignation, quantité, prix unitaire, remise, taxe, montant), totaux avec ventilation de TVA par taux, conditions de paiement, coordonnées de règlement, mentions légales. **Devis** : structure voisine, mention DEVIS, date de validité, zone d’acceptation.
- Les totaux imprimés viennent du calculateur et de l’instantané ; le PDF ne recalcule rien de son côté.
- **Brouillon** : PDF généré à la demande depuis les données courantes, avec filigrane BROUILLON, jamais stocké.
- **Devis envoyé et facture émise** : rendu depuis l’instantané, fichier stocké, jamais régénéré.

**Émission en deux phases.**

1. Transaction : numéro, instantané, `hash_snapshot`, état `emise`.
2. Hors transaction : rendu, dépôt du fichier, puis `UPDATE … SET pdf_reference = ?, hash_pdf = ? WHERE id = ? AND pdf_reference IS NULL`.

Le chemin du fichier est déterministe (par exemple `entreprise/type/numero.pdf`) : un nouvel essai réécrit le même fichier et ne laisse pas d’orphelin. Tant que `pdf_reference` est vide, `GET /pdf` génère le PDF à la volée depuis l’instantané et applique le même `UPDATE` conditionnel, ce qui évite toute course avec la tâche de réparation. La tâche `reconcile-pdf` (manuelle ou quotidienne) traite les factures émises sans PDF et consigne chaque opération dans l’audit.

**Hachages.** `hash_snapshot` couvre la forme canonique de l’instantané (RFC 8785, entiers écrits en chaînes). `hash_pdf` couvre les octets du fichier stocké. Deux PDF régénérés ne sont pas identiques octet pour octet (PDFKit insère des dates et des identifiants) : on ne les compare jamais entre eux. Ces empreintes, rangées dans la même base, détectent une corruption accidentelle, pas une altération malveillante.

**Annulation.** Le PDF émis reste intact ; un second fichier, généré depuis l’instantané, porte la mention ANNULÉE (`pdf_annulation_reference`).

## 14. API REST

**Standards.** Préfixe `/api/v1`. Montants et quantités échangés en chaînes décimales. Erreurs au format RFC 7807 (`application/problem+json`, avec le détail par champ). Listes paginées : `?page=&limit=&sort=&search=`, limite maximale 100, réponse `{ data, meta }`. Codes utilisés : 200, 201, 204, 400, 401, 403, 404, 409, 422, 429. Écritures concurrentes sur clients, produits, devis et factures protégées par `ETag` et `If-Match` (colonne `version`). `Idempotency-Key` obligatoire à la création d’un paiement.

| Ressource | Routes |
| --- | --- |
| Authentification | `POST /auth/register` (crée utilisateur, entreprise et appartenance), `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/change-password`, `GET /auth/me` |
| Entreprise | `GET /company`, `PUT /company` |
| Clients | `GET /clients`, `POST /clients`, `GET /clients/:id`, `PUT /clients/:id`, `POST /clients/:id/archive` |
| Produits | mêmes routes sous `/products` |
| Devis | `GET /quotes`, `POST /quotes`, `GET /quotes/:id`, `PUT /quotes/:id` et `DELETE /quotes/:id` (brouillon seulement), `POST /quotes/:id/send`, `accept` (corps : `date_acceptation`), `refuse`, `cancel`, `convert`, `GET /quotes/:id/pdf` |
| Factures | `GET /invoices`, `POST /invoices` (manuelle), `GET /invoices/:id`, `PUT /invoices/:id` et `DELETE /invoices/:id` (brouillon seulement), `POST /invoices/:id/issue`, `POST /invoices/:id/cancel`, `GET /invoices/:id/pdf` |
| Paiements | `GET /invoices/:id/payments`, `POST /invoices/:id/payments`, `POST /invoices/:id/payments/:paymentId/cancel` |
| Tableau de bord | `GET /dashboard/summary` |
| Santé | `GET /health`, `GET /ready` |

Il n’existe ni suppression de paiement, ni régénération du PDF d’une facture émise. La conversion renvoie 201 à la création et 200 quand la facture existait déjà.

**Définitions du tableau de bord.** Chiffre d’affaires facturé : somme des totaux HT des factures émises et non annulées, par date d’émission. Encaissé : somme des paiements valides, par date de paiement (TTC). Impayés : somme des soldes des factures émises. En retard : sous-ensemble des impayés dont l’échéance est dépassée. Devis en attente : devis envoyés non expirés.

## 15. Sécurité

**Authentification et session**

- Mots de passe hachés (pas chiffrés) avec Argon2id, ou bcrypt de coût 12 ; longueur minimale 12 caractères.
- Limitation des tentatives : 5 échecs par 15 minutes, par adresse IP et par compte, puis verrouillage temporaire.
- Jeton d’accès de 15 minutes ; refresh de 7 jours avec rotation ; la réutilisation d’un refresh déjà consommé révoque toute la lignée.
- Cookies `HttpOnly`, `Secure`, `SameSite` ; protection CSRF si les jetons voyagent par cookie.
- Récupération de compte (sans e-mail) : script opérateur `reset-password`. Il génère un mot de passe temporaire affiché une seule fois, positionne `doit_changer_mot_de_passe`, **révoque tous les refresh tokens** de l’utilisateur, et le serveur refuse ensuite toute route autre que `change-password` tant que le changement n’est pas fait (contrôle côté serveur, pas seulement dans l’interface).

**Autorisation et isolation**

- `entreprise_id` provient du jeton ; l’extension Prisma l’impose à chaque requête ; un test d’isolation par ressource tourne en intégration continue.
- Matrice rôle × action écrite avant l’ouverture des rôles.

**Entrées et fichiers**

- Validation Zod de chaque entrée ; corps JSON limité à 1 Mo.
- Logo : PNG ou JPEG, 2 Mo maximum, ré-encodé côté serveur ; SVG refusé.
- Les textes saisis ne sont jamais interprétés comme du HTML dans le PDF.

**Transport, secrets, dépendances**

- HTTPS, HSTS, CSP, `nosniff`, interdiction d’intégration en cadre, CORS explicite.
- Secrets dans l’environnement, jamais dans Git ; `.env.example` fourni.
- Audit des dépendances et mises à jour automatisées.

**Journalisation et audit**

- Journaux JSON avec identifiant de corrélation, sans données personnelles inutiles ni trace d’erreur exposée.
- `EVENEMENT_AUDIT` sur : création, envoi, émission, annulation, conversion, paiement, changement de paramètres, connexion.
- Durées de conservation et droits des personnes : à fixer selon le pays cible (§17).

## 16. Stratégie de tests

| Type | Contenu |
| --- | --- |
| Unitaires | Calculateur, arrondi, plus fort reste, machines à états (Vitest) |
| Propriétés (fast-check) | Invariants du §5.5 ; au moins trois taux ; remises proches du sous-total ; contre-exemple à cinq taux ; jeu de référence d’une centaine de cas dont les exemples 5.6 et 5.7 |
| Concurrence | N créations simultanées : numéros uniques et sans trou ; deux conversions simultanées : une seule facture ; deux paiements dont la somme dépasse le total : un seul accepté ; paiement et annulation simultanés |
| Intégration | API et PostgreSQL éphémère (Testcontainers) : transactions, repositories, extension d’isolation |
| Isolation | Pour chaque ressource, l’utilisateur A ne lit ni ne modifie rien de B |
| PDF | Fichier produit, numéro et totaux exacts, hachages vérifiés, scénario de réparation |
| Interface | Validation des formulaires, états vides, messages d’erreur |
| Bout en bout (Playwright) | Inscription, client, produit, devis, envoi, acceptation, conversion, émission, paiement, statuts et tableau de bord |

L’intégration continue enchaîne lint, vérification de types, tests unitaires et d’intégration, build ; les quatre premiers sont bloquants. Couverture visée : 90 % sur le calcul, la numérotation et les machines à états.

## 17. Risques et vérifications avant production

| Risque | Mesure | Quand |
| --- | --- | --- |
| Conformité légale locale (mentions, annulation, conservation) | Vérifications ci-dessous ; mentions configurables | Avant production |
| Facturation électronique normalisée | Génération isolée derrière une interface ; champ dédié prévu en v2 | Cadrage avant production |
| Écart de calcul | Spécification du §5 et tests de propriétés | Phase 0 |
| Concurrence (numéros, conversion, paiements) | Verrous et tests dédiés | Phases 0 et 3 |
| Mise en page PDF | Prototype précoce | Phase 0 |
| Fuite entre entreprises | Extension d’isolation et tests par ressource | Phase 1 |
| Perte de données | Sauvegardes quotidiennes et test de restauration | Avant production |
| Dérive du périmètre | Périmètre du §2 figé ; toute idée nouvelle va en v2 | En continu |
| Adoption par des artisans peu familiers du web | Essais avec 3 à 5 utilisateurs | Avant la phase 4 |
| Dépendance à une seule personne | README, ADR, runbook | En continu |

**Vérifications obligatoires avant toute mise en production.** Elles dépendent du pays et n’ont pas été validées dans ce document :

1. Fixer le pays cible (hypothèse de travail : zone UEMOA, devise XOF).
2. Vérifier auprès de l’administration fiscale si un régime de facture normalisée ou électronique est exigé.
3. Vérifier si l’annulation d’une facture non payée impose un avoir ; si oui, l’avoir entre dans le MVP, ou l’annulation est interdite.
4. Dresser la liste des mentions obligatoires et les rendre configurables (`mentions_legales`, `pied_de_page_pdf`, `identifiants_fiscaux`).
5. Vérifier la durée légale de conservation des pièces et des données personnelles.
6. Rédiger conditions d’utilisation et mentions légales du service, avec un avertissement : l’outil ne remplace pas un conseil comptable ou fiscal.

## 18. Déploiement et exploitation (minimal)

- Environnements : développement, préproduction (données synthétiques uniquement), production.
- Déploiement automatique en préproduction, sur validation en production ; migrations exécutées avant le démarrage de la nouvelle version.
- Hébergement et stockage objet : à choisir selon le coût, les sauvegardes managées et la proximité des utilisateurs.
- Sauvegardes quotidiennes chiffrées, conservées 30 jours ; restauration testée avant la production, puis périodiquement.
- Supervision minimale : disponibilité, erreurs serveur, échec de sauvegarde, factures émises sans PDF.
- Runbook : restauration, retour arrière applicatif (les migrations restent en avant seulement), rotation des secrets, récupération de compte, réparation des PDF manquants.

## 19. Ordre de réalisation

Le noyau à risque est construit avant les écrans : s’il ne tient pas, on le sait avant d’avoir investi dans l’interface.

| Phase | Contenu | Critère de sortie |
| --- | --- | --- |
| 0 · Noyau | Module `shared/money` et tests de propriétés ; table de séquences et attribution concurrente ; machines à états (fonctions pures) ; prototype PDF de facture depuis un instantané codé en dur ; schéma Prisma | Invariants verts, test de concurrence vert, un PDF correct sur un tableau long |
| 1 · Fondations | Dépôt et intégration continue ; authentification ; extension d’isolation et tests ; paramètres d’entreprise ; clients ; produits | Parcours de connexion et isolation prouvés |
| 2 · Devis | Brouillon, lignes, calcul en temps réel via le module partagé, envoi, PDF stocké, acceptation datée, refus, annulation | Devis envoyé et figé de bout en bout |
| 3 · Factures | Brouillon manuel, conversion, émission, PDF en deux phases, paiements, annulation, tâche de réparation | Cycle complet devis → paiement |
| 4 · Finalisation | Tableau de bord, durcissement, tests de bout en bout, sauvegardes, déploiement, essais utilisateurs | Vérifications du §17 engagées |

L’estimation de charge se fait à la fin de la phase 0, une fois les risques techniques levés.

## 20. Interface

Écrans : connexion et inscription, tableau de bord, clients, produits et services, devis (liste, édition, détail), factures (liste, détail, paiements), paramètres de l’entreprise. Principes : totaux toujours issus du module partagé ; états vides avec une action proposée ; messages d’erreur indiquant le champ et la correction ; usage possible sur tablette et téléphone ; états stockés et situations calculées clairement distingués ; clé d’idempotence générée à l’ouverture du formulaire de paiement.

## 21. Résultat attendu

L’utilisateur crée son entreprise, ajoute un client et des prestations, établit un devis, l’envoie, enregistre son acceptation, le convertit en facture, l’émet, encaisse les paiements et télécharge à chaque étape un PDF fidèle aux données enregistrées. Le projet démontre une application métier complète : calcul monétaire exact, numérotation sans trou, machines à états, concurrence maîtrisée, isolation entre entreprises et génération de documents à valeur probante.

## Annexe · Historique du document

| Version | Contenu |
| --- | --- |
| 1.0 | Plan initial |
| 2.0 | Spécification du calcul (milli-unités, points de base, bigint, plus fort reste) ; numérotation à l’envoi et à l’émission ; instantané à l’émission ; états stockés et calculés séparés ; conversion verrouillée ; paiements verrouillés et idempotents ; PDF en deux phases ; périmètre resserré ; vérifications légales isolées avant production |
