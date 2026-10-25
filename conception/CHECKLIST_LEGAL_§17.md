# Checklist légale §17 — Validation avant mise en production

> [!IMPORTANT]
> Ce document doit être rempli par un décideur humain (dirigeant, comptable ou
> conseiller juridique) **avant** toute mise en production. Les réponses
> conditionnent des développements supplémentaires (avoirs, mentions
> obligatoires, formats normalisés, etc.).

---

## 1. Pays / zone fiscale cible

| Question | Réponse |
|----------|---------|
| Dans quel(s) pays l'application sera-t-elle utilisée ? | ☐ à remplir |
| La TVA est-elle applicable ? Quel(s) taux ? | ☐ à remplir |
| Y a-t-il une exonération possible (auto-entrepreneur, micro, franchise) ? | ☐ à remplir |

---

## 2. Facture normalisée / électronique

| Question | Réponse |
|----------|---------|
| Une facture électronique structurée est-elle **obligatoire** (ex. Factur-X, UBL, ZATCA) ? | ☐ Oui &nbsp; ☐ Non &nbsp; ☐ À vérifier |
| Si oui, quel format et quelle plateforme de dépôt ? | ☐ à remplir |
| Les PDF actuels sont-ils suffisants ou faut-il un format machine-readable en plus ? | ☐ PDF seul suffisant &nbsp; ☐ Format structuré requis |

> [!NOTE]
> En France la facturation électronique obligatoire entre entreprises (B2B)
> entre en vigueur progressivement depuis 2024. En Afrique sub-saharienne
> les exigences varient selon les pays (ex. DGI Burkina Faso pour la TVA).

---

## 3. Annulation — avoir ou annulation directe

| Question | Réponse |
|----------|---------|
| La réglementation locale **interdit-elle** l'annulation directe d'une facture émise ? | ☐ Oui → avoir obligatoire &nbsp; ☐ Non → annulation acceptée |
| Si avoir requis : implémenter le module avoir (hors MVP actuel) ? | ☐ Oui &nbsp; ☐ Non &nbsp; ☐ Décision reportée |

> [!WARNING]
> Si l'annulation directe est interdite (cas France selon CGI art. 289),
> il faudra développer un module d'avoirs avant la mise en production.
> L'annulation actuelle (`POST /invoices/:id/cancel`) devra être remplacée
> ou restreinte.

---

## 4. Mentions obligatoires sur les documents

Vérifier que les champs entreprise configurables couvrent les mentions
légalement requises dans le pays cible :

| Mention | Champ disponible | Obligatoire ? |
|---------|-----------------|---------------|
| Numéro de SIREN/SIRET (France) ou IFU (Burkina Faso) | `taxIdentifiers` | ☐ Oui &nbsp; ☐ Non |
| Numéro de TVA intracommunautaire | `taxIdentifiers` | ☐ Oui &nbsp; ☐ Non |
| Forme juridique et capital | `legalMentions` | ☐ Oui &nbsp; ☐ Non |
| RCS / Greffe d'immatriculation | `legalMentions` | ☐ Oui &nbsp; ☐ Non |
| Mentions pénalités de retard (France) | `paymentTerms` | ☐ Oui &nbsp; ☐ Non |
| Indemnité forfaitaire recouvrement (40 € France) | `paymentTerms` | ☐ Oui &nbsp; ☐ Non |
| Numéro de bon de commande client | ☐ Champ manquant | ☐ Oui &nbsp; ☐ Non |

---

## 5. Durée de conservation légale

| Question | Réponse |
|----------|---------|
| Durée de conservation légale des factures dans le pays cible ? | ☐ à remplir (ex. 10 ans France) |
| La politique de sauvegarde dans le RUNBOOK est-elle conforme ? | ☐ Oui &nbsp; ☐ Non &nbsp; ☐ À vérifier |
| Les PDF stockés dans `var/documents/` sont-ils sauvegardés avec la base ? | ☐ Oui &nbsp; ☐ Non |

---

## 6. CGU et avertissement comptable

| Question | Réponse |
|----------|---------|
| Des CGU doivent-elles être affichées et acceptées à l'inscription ? | ☐ Oui &nbsp; ☐ Non |
| Un avertissement « ne remplace pas un conseil comptable » est-il requis ? | ☐ Oui &nbsp; ☐ Non |
| Politique de confidentialité / RGPD affichée ? | ☐ Oui &nbsp; ☐ Non |

---

## 7. Décisions et écarts identifiés

> Remplir après réunion de validation :

| Décision | Statut | Ticket / action |
|----------|--------|-----------------|
| Pays cible retenu | ☐ Décidé | |
| Avoir requis → module à développer | ☐ En attente | |
| Format électronique structuré | ☐ En attente | |
| Mentions manquantes à ajouter | ☐ En attente | |
| CGU à rédiger | ☐ En attente | |

---

## Critère de sortie

Cette checklist est considérée **signée** lorsque :
- Toutes les cases sont cochées (Oui / Non / N/A),
- Les écarts identifiés sont transformés en tickets avec responsable,
- Un décideur appose son nom et la date ci-dessous.

**Validé par :** ________________________________

**Date :** ________________________________

**Rôle :** ________________________________
