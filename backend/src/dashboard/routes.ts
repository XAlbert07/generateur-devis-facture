import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuthentication } from '../auth/authenticate.js';
import { prisma } from '../db/prisma.js';
import { expireQuotes } from '../quotes/lifecycle-routes.js';
import { problem } from '../invoices/common.js';
import { startOfCompanyDay } from '../../../shared/documents/date-only.js';

type DashboardRow = {
  billedExcludingTax: string;
  paid: string;
  outstanding: string;
  overdue: string;
  issuedInvoices: number;
};

export const dashboardRouter = Router();
dashboardRouter.use(requireAuthentication);

dashboardRouter.get('/summary', async (request: Request, response: Response) => {
  const companyId = request.auth!.companyId;
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { currency: true, timezone: true } });
  if (!company) return problem(response, 404, 'Entreprise introuvable');
  const now = new Date();
  const today = startOfCompanyDay(company.timezone, now);
  await expireQuotes(companyId);

  const [rows, pendingQuotes] = await Promise.all([
    prisma.$queryRaw<DashboardRow[]>`
      SELECT
        (SELECT COALESCE(SUM("total_ht_apres_remise"), 0)::text FROM "facture"
         WHERE "entreprise_id" = ${companyId}::uuid AND "status" = 'EMISE') AS "billedExcludingTax",
        (SELECT COALESCE(SUM(p."amount"), 0)::text FROM "paiement" p
         JOIN "facture" f ON f."id" = p."facture_id"
         WHERE f."entreprise_id" = ${companyId}::uuid AND f."status" = 'EMISE' AND p."annule_le" IS NULL) AS "paid",
        COALESCE(SUM(f."total_ttc"::numeric - COALESCE(p."paid", 0)), 0)::text AS "outstanding",
        COALESCE(SUM(CASE WHEN f."date_echeance" < ${today}::date
          THEN f."total_ttc"::numeric - COALESCE(p."paid", 0) ELSE 0 END), 0)::text AS "overdue",
        COUNT(*)::int AS "issuedInvoices"
      FROM "facture" f
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM("amount"), 0) AS "paid"
        FROM "paiement" WHERE "facture_id" = f."id" AND "annule_le" IS NULL
      ) p ON true
      WHERE f."entreprise_id" = ${companyId}::uuid AND f."status" = 'EMISE'
    `,
    prisma.quote.count({ where: {
      companyId, status: 'ENVOYE', OR: [{ validUntil: null }, { validUntil: { gte: today } }],
    } }),
  ]);
  const totals = rows[0];
  response.json({
    generatedAt: now.toISOString(), currency: company.currency.trim(),
    amounts: {
      billedExcludingTax: BigInt(totals?.billedExcludingTax ?? '0'),
      paid: BigInt(totals?.paid ?? '0'),
      outstanding: BigInt(totals?.outstanding ?? '0'),
      overdue: BigInt(totals?.overdue ?? '0'),
    },
    counts: { issuedInvoices: totals?.issuedInvoices ?? 0, pendingQuotes },
  });
});
