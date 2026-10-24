import { prisma } from './prisma.js';

/**
 * Client Prisma borné à une entreprise.
 *
 * Les routes métier ne reçoivent jamais le client Prisma global : cette
 * extension ajoute le filtre entreprise_id aux lectures et écrit l'entreprise
 * de la session lors des créations. Les modèles enfants (lignes, paiements)
 * seront exposés uniquement à travers leur document parent.
 */
export function prismaForCompany(companyId: string) {
  return prisma.$extends({
    query: {
      client: {
        async $allOperations({ operation, args, query }) {
          // Le type public de Prisma ne peut pas exprimer qu'une extension
          // injecte un champ obligatoire. La frontière non typée reste donc
          // ici, unique, et jamais dans les routes métier.
          const scopedArgs = args as any;
          if (operation === 'create') {
            scopedArgs.data = { ...scopedArgs.data, companyId };
            return query(scopedArgs);
          }
          if (operation === 'createMany') {
            scopedArgs.data = Array.isArray(scopedArgs.data)
              ? scopedArgs.data.map((item: object) => ({ ...item, companyId }))
              : { ...scopedArgs.data, companyId };
            return query(scopedArgs);
          }

          // findUnique accepte des filtres complémentaires depuis Prisma 5 ;
          // l'identifiant reste unique, companyId le borne au locataire.
          if ('where' in scopedArgs) {
            scopedArgs.where = { ...scopedArgs.where, companyId };
          }
          return query(scopedArgs);
        },
      },
      product: {
        async $allOperations({ operation, args, query }) {
          const scopedArgs = args as any;
          if (operation === 'create') {
            scopedArgs.data = { ...scopedArgs.data, companyId };
            return query(scopedArgs);
          }
          if (operation === 'createMany') {
            scopedArgs.data = Array.isArray(scopedArgs.data)
              ? scopedArgs.data.map((item: object) => ({ ...item, companyId }))
              : { ...scopedArgs.data, companyId };
            return query(scopedArgs);
          }
          if ('where' in scopedArgs) scopedArgs.where = { ...scopedArgs.where, companyId };
          return query(scopedArgs);
        },
      },
    },
  });
}
