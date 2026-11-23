# Le Grand Cinéma — Backend

API minimale de réservation de cinéma avec NestJS, TypeScript, Prisma et PostgreSQL.

Fonctions : JWT (`USER`/`ADMIN`), films et séances, salles persistées, sièges disponibles, réservation atomique, paiement simulé, billet numérique activé après paiement, administration, remplissage et prévision simple. Swagger est disponible sur `/docs`.

Le paiement est volontairement simulé pour la démonstration : `POST /reservations/:id/payment` passe le paiement à `PAID` et active le billet. Aucun numéro de carte n’est demandé ni conservé.

## Lancer localement

```bash
cp .env.example .env
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run start:dev
```

Comptes de démonstration locaux uniquement :

- `user@demo.cinema` / `DemoUser123!` (`USER`)
- `admin@demo.cinema` / `DemoAdmin123!` (`ADMIN`)

Changez ou supprimez ces comptes avant toute exposition réelle.

## Vérifications

```bash
npm run lint
npm run prisma:validate
npm test
npm run test:e2e
npm run test:cov
npm run build
```

Les tests unitaires isolent Prisma et ne nécessitent pas de base locale. Le test de concurrence utilise PostgreSQL dans la CI. Le schéma est appliqué exclusivement avec les migrations versionnées de `prisma/migrations` afin que la base locale, la CI et la production restent identiques.
