# GearTrack

GearTrack suit l'entretien des vélos et l'utilisation des chaussures de running/trail. Les données sont enregistrées dans PostgreSQL ; aucune donnée de démonstration n'est créée.

## Architecture

- **Frontend** : React, TypeScript, Vite et Tailwind CSS.
- **Backend actif** : API REST JavaScript avec Node.js 24 et Express.
- **Base** : PostgreSQL via `pg`, pool limité à quatre connexions.
- **Développement** : Docker Compose (PostgreSQL, API et frontend Nginx).
- **Production IHME** : une image Docker React compilé + Express, PostgreSQL fourni par la plateforme.
- **Migrations actives** : SQL transactionnel, additif et idempotent.
- **Tests backend** : `node:test`, Supertest et `pg-mem`.

Diagrammes : [architecture](docs/architecture.md) · [modèle relationnel](docs/schema.md).

## Fonctionnalités

- Tableau de bord sans données fictives : équipements, distances enregistrées, activité récente et échéances/retards d'entretien.
- Vélos : CRUD, composants avec intervalles kilométriques, sorties et journal d'entretien.
- Chaussures : CRUD, sorties avec distance par surface, durée, dénivelé et pas facultatifs, statistiques et évaluations de semelle, accroche, amorti et confort.
- Indice d'usure transparent : distance pondérée selon le terrain et le dénivelé, affichée séparément de la distance réelle. La durée et les pas ne sont pas recomptés. Il ne prédit pas scientifiquement une durée de vie.
- API documentée par une spécification OpenAPI (`/openapi.json`) et une page d'accès (`/docs`).

## Prérequis

- Docker avec Docker Compose v2 pour le lancement complet.
- Node.js 24+ et npm pour les tests et le développement frontend.
- Git.

## Lancement local avec Docker Compose

Depuis la racine du dépôt :

```bash
cp .env.example .env
docker compose up --build
```

Adaptez au besoin les valeurs locales de `.env`. Adresses par défaut :

- Frontend : <http://localhost:5173>
- API et santé : <http://localhost:8001/api> et <http://localhost:8001/api/health>
- Documentation API : <http://localhost:8001/docs>
- Tableau de bord API : <http://localhost:8001/api/dashboard>

Le backend écoute sur le port conteneur `3000`, publié sur le port hôte GearTrack `8001` (`API_PORT`). Nginx relaie `/api`, `/docs` et `/openapi.json` vers `backend:3000`. Le frontend navigateur utilise des chemins relatifs et n'a pas besoin de CORS dans ce parcours.

PostgreSQL utilise le volume persistant `postgres_data`. Pour arrêter les services sans supprimer les données, exécutez `docker compose down` (ne pas ajouter `-v`).

## Développement et migrations

Le frontend peut être lancé sur l'hôte contre le backend de Compose :

```bash
npm ci --prefix frontend
npm run dev --prefix frontend
```

Vite relaie `/api`, `/docs` et `/openapi.json` vers `http://localhost:${API_PORT}` ; `API_PORT` est lu depuis le `.env` à la racine et vaut `8001` par défaut. Compose doit avoir démarré le backend.

Pour lancer le serveur Node hors Compose, installez avec `npm ci --prefix backend`, puis exécutez `npm start --prefix backend` en lui fournissant une variable `DATABASE_URL` pointant vers PostgreSQL accessible et, si nécessaire, `PORT` (défaut `3000`). Le serveur applique la migration avant d'accepter les requêtes. Les facteurs d'usure `WEAR_TRAIL_FACTOR` et `WEAR_ELEVATION_FACTOR_PER_100M` sont optionnels.

La migration active crée les tables et index manquants et n'exécute ni suppression ni réinitialisation. Elle est compatible avec le schéma initial Alembic fourni par le projet. Elle ne modifie pas les tables préexistantes ; tout schéma externe différent doit être contrôlé avant utilisation.

## COROS

Le code et la configuration du prototype OAuth/MCP Python historique sont conservés, mais ils ne sont pas utilisés par Express et aucune route COROS n'est disponible dans le serveur actif. Aucune connexion ni synchronisation COROS n'est revendiquée.

## Déploiement IHME

La plateforme attend une application sur le port conteneur `3000`, une API sous `/api`, `/api/health`, et `DATABASE_URL`. L'image de production respecte ce contrat. Le build accepte `BASE_PATH`; le workflow IHME la compile sous `/projet-info-ihme/`. Express sert le frontend compilé et traite les appels API. Le pool PostgreSQL est limité à quatre connexions.

Dans **Settings → Secrets and variables → Actions**, configurer les noms attendus par les workflows :

| Type | Nom |
|---|---|
| Secret | `IHME_DEPLOY_TOKEN` |
| Variable | `IHME_DEPLOY_URL` |
| Variable | `IHME_BASE_PATH` (`/projet-info-ihme/`) |

Ne placez aucun jeton ou fichier d'accès dans le dépôt. Un push sur `main`/`master` lance tests et publication GHCR ; il ne déploie pas automatiquement. Le déploiement ne se déclenche que manuellement depuis **Actions → Construire et publier l’image → Run workflow**, avec l'option de déploiement activée. La plateforme fournit `DATABASE_URL`. N'utilisez que des données fictives sur l'hébergement pédagogique.

L'API n'a pas encore d'authentification ; n'y stockez pas de données personnelles ou sensibles. COROS reste hors du backend Express.

## Tests et build

```bash
npm ci --prefix backend
npm test --prefix backend
npm ci --prefix frontend
npm run build --prefix frontend
```

Les tests API utilisent PostgreSQL en mémoire et ne valident pas la connexion à une instance PostgreSQL réelle. Le build frontend destiné au chemin du cours peut être vérifié avec :

```bash
BASE_PATH=/projet-info-ihme/ npm run build --prefix frontend
```

Le Dockerfile racine accepte également `--build-arg BASE_PATH=/projet-info-ihme/`.

## Limites connues

- Pas d'authentification, de partage entre comptes, ni d'intégration COROS/Strava active.
- La modification/suppression des sorties et des opérations d'entretien n'est pas exposée dans l'interface.
- Les échéances d'entretien sont kilométriques, sans rappel calendaire.
- Le total de distance du tableau de bord additionne les sorties enregistrées dans GearTrack ; le compteur initial du vélo est utilisé séparément pour calculer les échéances.
