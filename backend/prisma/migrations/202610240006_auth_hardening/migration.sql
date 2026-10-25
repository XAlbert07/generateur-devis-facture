-- Durcissement session (§15) : refresh rotatif, verrouillage, journal des tentatives.

ALTER TABLE "utilisateur"
  ADD COLUMN "verrouille_jusqu_au" TIMESTAMPTZ(6);

CREATE TABLE "refresh_token" (
  "id" UUID NOT NULL,
  "utilisateur_id" UUID NOT NULL,
  "empreinte_jeton" CHAR(64) NOT NULL,
  "famille_id" UUID NOT NULL,
  "expire_le" TIMESTAMPTZ(6) NOT NULL,
  "revoque_le" TIMESTAMPTZ(6),
  "remplace_par" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_token_empreinte_jeton_key" ON "refresh_token"("empreinte_jeton");
CREATE INDEX "refresh_token_utilisateur_id_idx" ON "refresh_token"("utilisateur_id");
CREATE INDEX "refresh_token_famille_id_idx" ON "refresh_token"("famille_id");

ALTER TABLE "refresh_token"
  ADD CONSTRAINT "refresh_token_utilisateur_id_fkey"
  FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tentative_connexion" (
  "id" UUID NOT NULL,
  "email" TEXT,
  "ip" TEXT NOT NULL,
  "succeeded" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tentative_connexion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tentative_connexion_email_created_at_idx" ON "tentative_connexion"("email", "created_at");
CREATE INDEX "tentative_connexion_ip_created_at_idx" ON "tentative_connexion"("ip", "created_at");
