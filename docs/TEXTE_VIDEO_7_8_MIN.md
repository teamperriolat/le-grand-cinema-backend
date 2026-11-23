# Texte de présentation — vidéo de 7 à 8 minutes

Durée visée : environ 7 minutes 30. Les indications entre crochets décrivent ce qu’il faut afficher, elles ne sont pas à lire.

## 0:00 – 0:40 — Introduction

Bonjour, je suis Valérian Perriolat. Dans cette vidéo, je vais présenter les corrections et les améliorations apportées au projet Le Grand Cinéma à la suite du retour de correction.

L’objectif était d’enrichir le back-end avec la gestion des salles, des billets et du paiement, de conserver une organisation par user story sur des branches dédiées, puis de présenter trois bugs corrigés avec leurs tests de non-régression.

Je vais d’abord montrer rapidement l’application, puis la structure de la base de données, les branches Git, les trois corrections et enfin les résultats des tests et de la couverture.

[Afficher la page d’accueil du site, puis la page GitHub du projet.]

## 0:40 – 1:35 — Parcours utilisateur et connexion

L’application dispose maintenant d’une interface plus complète et adaptée à un écran d’ordinateur comme à un affichage mobile. L’utilisateur peut consulter les films et les séances sans être connecté.

Lorsqu’il veut réserver, il ouvre la fenêtre de connexion. Le bouton de connexion devient un bouton de déconnexion lorsque l’authentification a réussi. L’API utilise un jeton JWT et distingue deux rôles : utilisateur et administrateur.

Après la connexion, je sélectionne une séance. Le plan de salle affiche les places disponibles, sélectionnées et déjà occupées. Une réservation est limitée à huit places. Le montant est calculé à partir du tarif de la séance et du nombre de places choisies.

[Se connecter avec le compte utilisateur, ouvrir une séance et sélectionner deux places.]

## 1:35 – 2:30 — Paiement et billet numérique

La réservation crée maintenant deux objets distincts dans le back-end : un paiement et un billet.

Le paiement commence avec le statut « en attente ». Pour cette démonstration, le paiement est simulé : aucune donnée bancaire réelle n’est demandée ou enregistrée. Lorsque je clique sur payer, l’API passe le paiement au statut « payé » et active le billet.

Avant le paiement, le QR code reste désactivé. Après le paiement, le billet numérique affiche le film, la date, la salle, les places, le montant, son numéro unique et son QR code. Cette séparation évite qu’un billet non payé soit présenté comme valide.

[Confirmer la réservation, montrer « paiement en attente », cliquer sur « Payer », puis montrer le QR code actif.]

## 2:30 – 3:20 — Salles et modèle Prisma

La salle n’est plus seulement une chaîne de caractères dans une séance. Elle possède maintenant son propre modèle Prisma, avec un identifiant, un nom et une capacité. Une séance référence une salle grâce à une relation en base de données.

Le back-end expose aussi les opérations d’administration permettant de lister, créer, modifier et supprimer une salle. Une salle utilisée par une séance ne peut pas être supprimée, afin de protéger l’intégrité des données.

Les modèles Ticket et Payment sont également reliés à Reservation avec des relations uniques. Le billet possède son code et son statut. Le paiement possède son montant, son statut et sa date de paiement.

Une migration Prisma versionnée transforme les anciennes données sans supprimer les réservations existantes. Elle crée les salles à partir des anciennes séances et convertit les anciens codes de billet en véritables enregistrements Ticket.

[Afficher `schema.prisma`, puis la migration `20261123000000_rooms_tickets_payments`.]

## 3:20 – 4:00 — Administration

Le tableau de bord administrateur permet de créer, modifier et supprimer les films et les séances. Les formulaires ont été séparés et rendus plus lisibles.

Lors de la création d’une séance, la salle est enregistrée ou réutilisée, sa capacité est associée au plan de places, puis les sièges sont générés par rangées.

L’administrateur peut également consulter les réservations, annuler un billet ou le marquer comme utilisé. L’annulation libère les sièges et annule le billet. La validation d’un billet conserve les sièges et enregistre sa date d’utilisation.

[Afficher le tableau de bord administrateur et créer ou modifier une séance de démonstration.]

## 4:00 – 4:45 — Branches et organisation par user story

Le développement a été organisé sur des branches dédiées. On retrouve notamment les branches de création de réservation, de gestion de la programmation, de gestion des réservations, de prévision de fréquentation et de protection contre la double réservation.

Côté interface, d’autres branches concernent la consultation des films, la disponibilité des places, le billet numérique et le tableau de bord de remplissage.

Chaque évolution est donc isolée, vérifiée puis fusionnée. Cette organisation facilite la relecture du code et permet de rattacher une modification à une user story précise.

[Afficher la liste des branches puis quelques pull requests fusionnées.]

## 4:45 – 6:10 — Trois bugs corrigés

Je vais maintenant présenter trois bugs et les tests qui empêchent leur réapparition.

Premier bug : un utilisateur pouvait envoyer deux fois le même identifiant de siège dans une seule requête. Le service compare maintenant la taille de la liste avec celle d’un ensemble sans doublons. Si une place est répétée, l’API renvoie une erreur de sélection. Un test unitaire vérifie précisément ce comportement.

Deuxième bug : une requête pouvait contenir une place appartenant à une autre séance. Le service recherche maintenant les sièges avec deux conditions : leur identifiant doit être demandé et leur `screeningId` doit correspondre à la séance choisie. Si le nombre de places retrouvées est différent, la réservation est refusée. Là encore, un test de non-régression est présent.

Troisième bug : deux utilisateurs pouvaient tenter de réserver la même place au même instant. La réservation est maintenant exécutée dans une transaction PostgreSQL avec le niveau d’isolation sérialisable. Une contrainte unique protège aussi chaque siège réservé. Les conflits Prisma sont transformés en réponse HTTP 409. Le test de concurrence lance deux réservations simultanées et vérifie qu’une seule réussit.

[Afficher les trois tests dans `reservations.service.spec.ts`, puis `reservation.concurrency-spec.ts`.]

## 6:10 – 7:05 — Qualité, tests et intégration continue

La chaîne d’intégration continue démarre une véritable base PostgreSQL. Elle valide le schéma et les migrations Prisma, exécute le lint ESLint, les tests unitaires, le test d’authentification, le test de concurrence, la couverture et la compilation.

Actuellement, les six suites unitaires représentent 43 tests réussis. La couverture globale atteint 98,68 % des instructions, 99,23 % des lignes, 97,22 % des fonctions et 92 % des branches. Toutes les valeurs dépassent donc l’objectif de 80 %.

SonarCloud analyse également le projet et la Quality Gate est attendue par la CI. Une erreur de qualité empêche donc la validation automatique.

[Afficher le terminal avec `npm test` et `npm run test:cov`, puis le job GitHub Actions réussi.]

## 7:05 – 7:40 — Conclusion

Pour conclure, le projet comprend maintenant une connexion avec rôles, un véritable plan de salle, des réservations atomiques, des salles persistées, un paiement simulé, un billet numérique avec QR code, une administration complète et une base PostgreSQL gérée par des migrations Prisma.

Les trois bugs présentés sont couverts par des tests de non-régression, et les contrôles automatiques dépassent l’objectif de couverture demandé.

Ces modifications répondent aux éléments indiqués dans le retour de correction tout en préservant les données déjà présentes. Merci d’avoir regardé cette présentation.

[Terminer sur le site fonctionnel, puis afficher brièvement le pipeline vert.]


