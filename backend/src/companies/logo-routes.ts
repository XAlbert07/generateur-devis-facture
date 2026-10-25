import type { Request, Response } from 'express';
import express, { Router } from 'express';
import sharp from 'sharp';
import { prisma } from '../db/prisma.js';
import { problem } from '../http/problem.js';
import { readCompanyLogo, saveCompanyLogo } from './logo-storage.js';

const logoInput = express.raw({ type: ['image/png', 'image/jpeg'], limit: '2mb' });
const pixelLimit = 20_000_000;
const outputLimit = 1_000_000;

function versionFrom(request: Request): number | undefined {
  const value = Number(request.header('if-match')?.replaceAll('"', ''));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export const companyLogoRouter = Router();

companyLogoRouter.put('/', logoInput, async (request: Request, response: Response) => {
  if (request.auth!.role !== 'ADMINISTRATEUR') return problem(response, 403, 'Droits administrateur requis');
  const version = versionFrom(request);
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const mime = request.header('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (!['image/png', 'image/jpeg'].includes(mime ?? '')) return problem(response, 415, 'Format attendu : PNG ou JPEG');
  const input = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
  if (!input.length) return problem(response, 422, 'Image vide ou illisible');

  let png: Buffer;
  try {
    const source = sharp(input, { failOn: 'warning', limitInputPixels: pixelLimit, limitInputChannels: 4 });
    const metadata = await source.metadata();
    const expectedFormat = mime === 'image/png' ? 'png' : 'jpeg';
    if (metadata.format !== expectedFormat || (metadata.pages ?? 1) > 1) return problem(response, 422, 'Image PNG/JPEG simple requise');
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > pixelLimit) return problem(response, 422, 'Dimensions de logo trop grandes');
    png = await sharp(input, { failOn: 'warning', limitInputPixels: pixelLimit, limitInputChannels: 4 })
      .rotate().resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true }).toBuffer();
  } catch {
    return problem(response, 422, 'Image PNG/JPEG invalide');
  }
  if (png.length > outputLimit) return problem(response, 422, 'Logo trop volumineux après ré-encodage');
  const companyId = request.auth!.companyId;
  const stored = await saveCompanyLogo(companyId, png);
  const changed = await prisma.company.updateMany({
    where: { id: companyId, version },
    data: { logoReference: stored.reference, logoHash: stored.hash, version: { increment: 1 } },
  });
  if (!changed.count) return problem(response, 409, 'Entreprise modifiée ou introuvable');
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  response.setHeader('ETag', `"${company.version}"`).status(200).json({ logoHash: company.logoHash, version: company.version });
});

companyLogoRouter.get('/', async (request: Request, response: Response) => {
  const company = await prisma.company.findUnique({ where: { id: request.auth!.companyId }, select: { logoReference: true, logoHash: true } });
  if (!company) return problem(response, 404, 'Entreprise introuvable');
  if (!company.logoReference || !company.logoHash) return problem(response, 404, 'Aucun logo configuré');
  try {
    const bytes = await readCompanyLogo(request.auth!.companyId, company.logoReference, company.logoHash);
    response.setHeader('ETag', `"${company.logoHash}"`).type('image/png').setHeader('Content-Disposition', 'inline; filename="logo.png"').send(bytes);
  } catch {
    return problem(response, 404, 'Fichier de logo introuvable ou invalide');
  }
});

companyLogoRouter.delete('/', async (request: Request, response: Response) => {
  if (request.auth!.role !== 'ADMINISTRATEUR') return problem(response, 403, 'Droits administrateur requis');
  const version = versionFrom(request);
  if (!version) return problem(response, 428, 'En-tête If-Match requis');
  const changed = await prisma.company.updateMany({
    where: { id: request.auth!.companyId, version },
    data: { logoReference: null, logoHash: null, version: { increment: 1 } },
  });
  if (!changed.count) return problem(response, 409, 'Entreprise modifiée ou introuvable');
  const company = await prisma.company.findUniqueOrThrow({ where: { id: request.auth!.companyId } });
  response.setHeader('ETag', `"${company.version}"`).json({ logoHash: null, version: company.version });
});
