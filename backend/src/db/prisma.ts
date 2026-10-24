import { PrismaClient } from '@prisma/client';

/** Une seule instance évite d'épuiser les connexions lors du rechargement en développement. */
export const prisma = new PrismaClient();
