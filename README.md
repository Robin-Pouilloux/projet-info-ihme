# GearTrack

GearTrack est une application personnelle pour suivre l'entretien des vélos et l'utilisation des chaussures de running/trail. Elle conserve les activités dans PostgreSQL et ne crée aucune donnée de démonstration.

## Architecture

- **Frontend** : React, TypeScript, Vite et Tailwind CSS.
- **Backend** : API REST FastAPI, SQLAlchemy et Pydantic.
- **Données** : PostgreSQL, schéma relationnel et migrations Alembic.
- **Développement local** : Docker Compose avec images frontend/backend et volume PostgreSQL persistant.
- **Déploiement IHME** : image de production unique (React compilé + FastAPI), PostgreSQL fourni par le serveur.
- **Tests** : pytest avec base SQLite isolée pour les tests API/métier.

Diagrammes Mermaid : [architecture](docs/architecture.md) · [modèle relationnel](docs/schema.md).

## Fonctionnalités

- Tableau de bord sans données préremplies : équipements, kilométrages consignés, activité récente et échéances de maintenance.
- Vélos : création, modification et suppression ; compteur kilométrique initial ; composants avec intervalle d'entretien ; sorties et journal d'entretien (date, kilométrage, opération, coût).
- Chaussures : création, modification et suppression ; sorties avec durée, dénivelé, pas facultatifs et distances route/trail ; statistiques par paire ; évaluations de semelle, accroche, amorti et confort.
- Indice d'usure des chaussures, affiché séparément du kilométrage réel et réglable par facteurs de terrain et de dénivelé. Il utilise la distance comme exposition de base ; durée et pas ne sont pas ajoutés une seconde fois.
- API documentée par OpenAPI/Swagger à `/docs`.

## Prérequis

- Docker Desktop avec le daemon démarré, et Docker Compose v2.
- Pour le développement hors Docker : Node.js 20+ / npm, Python 3.12+ et PostgreSQL 16+.
- Git pour le versionnement local.

## Lancement avec Docker Compose

Depuis la racine du projet :

```bash
cp .env.example .env
# Modifiez les paramètres locaux si nécessaire.
docker compose up --build
```

- Application : <http://localhost:5173>
- Swagger : <http://localhost:8001/docs> (également relayé sur <http://localhost:5173/docs>)
- API : <http://localhost:8001/api>

Le port hôte GearTrack par défaut est `8001`, distinct du port `8000` interne au conteneur backend : Compose publie `${API_PORT:-8001}:8000`. Si le port hôte `8000` est déjà utilisé, conservez `API_PORT=8001` dans `.env`. Le frontend Docker utilise un chemin `/api` relatif et Nginx relaie les requêtes vers `backend:8000` sur le réseau Compose ; il ne contacte donc ni Endurance Lab ni un port hôte. Les migrations Alembic sont appliquées automatiquement au démarrage du backend. Les données PostgreSQL sont conservées dans le volume `postgres_data`, y compris après l'arrêt des conteneurs. Pour arrêter les services sans supprimer les données : `docker compose down`. La suppression du volume avec `docker compose down -v` efface la base.

Les valeurs de `.env.example` sont des valeurs de développement locales, pas des secrets de production. Ne publiez jamais votre `.env`.

## Développement et migrations

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --no-access-log
```

La variable `DATABASE_URL` doit alors pointer vers une instance PostgreSQL accessible (par défaut `postgresql+psycopg://geartrack:geartrack@localhost:5432/geartrack`). Les facteurs d'usure configurables sont `WEAR_TRAIL_FACTOR` et `WEAR_ELEVATION_FACTOR_PER_100M`.

Créer une migration après une évolution des modèles :

```bash
cd backend
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Frontend

Dans un autre terminal :

```bash
cd frontend
npm install
npm run dev
```

Vite relaie `/api`, `/docs` et `/openapi.json` vers le backend local publié par Compose. Il lit `API_PORT` depuis le `.env` à la racine du dépôt (`8001` par défaut), pas depuis `frontend/`. Ainsi, le navigateur appelle toujours une URL relative au frontend Vite et le proxy envoie les requêtes à `http://localhost:8001`, jamais à `localhost:8000` lorsque Endurance Lab y écoute. Si vous choisissez un autre port hôte, mettez à jour `API_PORT` puis redémarrez Vite et recréez le service backend avec `docker compose up -d --force-recreate backend`.

En développement Docker/API, vérifiez `http://localhost:8001/api/health` et `http://localhost:8001/api/dashboard`. Dans la version Compose avec frontend, les mêmes ressources sont accessibles via `http://localhost:5173/api/health` et `http://localhost:5173/api/dashboard`. Le proxy navigateur conserve la même origine ; CORS n'est pas nécessaire pour ce parcours.

## Prototype OAuth COROS MCP (lecture seule)

Le prototype utilise l'enregistrement dynamique OAuth COROS et l'endpoint MCP officiel. Il requiert une connexion Internet et le navigateur de l'utilisateur pour approuver l'accès. Il ne demande pas le mot de passe COROS et ne stocke aucune activité dans la base GearTrack.

Le callback local `http://localhost:8001/api/coros/oauth/callback` a été accepté par l'endpoint d'enregistrement dynamique COROS avec `token_endpoint_auth_method=none`. Le flux construit un `state` et un PKCE S256 côté serveur, échange le code, puis appelle uniquement l'outil MCP documenté `querySportRecords` sur les sept derniers jours. La liste/les détails d'activités ne sont ni renvoyés ni persistés par ce prototype. Le statut n'affiche aucun jeton. L'état et le jeton d'accès ne vivent qu'en mémoire du backend : ils disparaissent à son redémarrage. L'accès OAuth et l'appel MCP avec un compte réel restent à valider par l'utilisateur.

### Essai local réel

1. Démarrez ou reconstruisez uniquement le backend GearTrack (ne faites pas `down` et ne touchez pas aux autres projets) :

   ```bash
   docker compose up -d --build backend
   ```

2. Ouvrez <http://localhost:8001/api/coros/auth/start> dans le navigateur, connectez-vous à COROS et approuvez la demande. COROS revient sur le callback HTTP loopback du poste qui a lancé le navigateur.
3. La page de retour confirme si l'appel de lecture MCP a réussi. Le statut non sensible est consultable sur <http://localhost:8001/api/coros/auth/status>.

Le callback `localhost` est adapté à cet usage sur le même poste ; n'utilisez pas `localhost` depuis un navigateur distant. Pour une instance distante, un callback HTTPS publiquement accessible et une URI déclarée correspondante seraient nécessaires ; ce prototype n'est pas configuré pour cela. Les métadonnées COROS indiquent la prise en charge des jetons liés à un certificat TLS, mais ne permettent pas de conclure que le certificat est obligatoire pour ce client public : le test réel OAuth/MCP doit confirmer ce point. Aucune activité réelle n'a encore été récupérée.

Les journaux d'accès Uvicorn sont désactivés pour le backend dans Compose, car le callback OAuth transporte temporairement `code` et `state` dans sa query string. Ne réactivez pas ces logs sans filtrage de cette route. Aucun secret client COROS n'est fourni dans `.env.example` ; l'enregistrement dynamique a retourné un client public sans `client_secret`.

## Préparer le déploiement IHME

L'instance de cours utilise une image unique, accessible sur le port conteneur `3000`, et un PostgreSQL déjà géré par le serveur. Le Compose local à trois services reste le mode de développement ; le Dockerfile racine crée l'image de production React + FastAPI et n'embarque pas PostgreSQL.

**Écart à faire valider avant déploiement :** le message du professeur nomme Express, alors que le backend imposé et existant de GearTrack est FastAPI. Cette image respecte le contrat HTTP observable (application sur `3000`, API `/api`, contrôle `/api/health`) mais ne remplace pas FastAPI par Express. Demander au professeur de confirmer que cette adaptation de framework est acceptée ; ne pas migrer le backend sans cette validation.

Pour le dépôt attribué `Robin-Pouilloux/projet-info-ihme`, le nom d'image attendu est `ghcr.io/robin-pouilloux/projet-info-ihme`. Le chemin public attribué est `/projet-info-ihme/`. Le workflow construit le frontend avec ce préfixe et les appels API utilisent le même chemin ; le proxy du cours retire ce préfixe avant de transmettre les requêtes à FastAPI.

Dans **Settings → Secrets and variables → Actions**, configurer :

| Type | Nom | Valeur |
|---|---|---|
| Secret | `IHME_DEPLOY_TOKEN` | Valeur du fichier d'accès personnel remis par le professeur |
| Variable | `IHME_DEPLOY_URL` | `https://node219697-ihme26.jcloud.ik-server.com/__deploy/p15` |
| Variable | `IHME_BASE_PATH` | `/projet-info-ihme/` |

Ne copiez jamais le jeton dans le dépôt, le fichier `.env`, une issue ou une capture. Le workflow utilise `GITHUB_TOKEN` pour publier l'image privée dans GHCR et transmet au serveur seulement son jeton de registre temporaire lors d'un déploiement manuel.

Après configuration des variables et du secret, un push sur `main` ou `master` lance les tests et publie l'image, sans changer l'application en ligne. Pour déployer, aller dans **Actions → Construire et publier l’image → Run workflow**, cocher `Déployer cette version après construction` et lancer l'action. Le workflow transmet le digest de l'image ; le serveur attend que `/api/health` soit sain avant de confirmer le déploiement.

Au démarrage, le conteneur applique les migrations Alembic sur `DATABASE_URL`, fourni par le serveur. L'endpoint `/api/health` vérifie maintenant une requête SQL et répond en erreur si PostgreSQL n'est pas disponible. Le pool SQLAlchemy est limité à quatre connexions (`pool_size=4`, sans connexions supplémentaires). Utilisez uniquement des données fictives sur l'hébergement pédagogique.

COROS est désactivé dans l'image de production du cours : le prototype actuel a un callback localhost et un jeton éphémère en mémoire, et n'est pas adapté à une instance publique. Les routes COROS restent disponibles dans le Compose local. L'API GearTrack ne dispose pas encore d'authentification : ne stockez aucune donnée personnelle ou sensible sur l'instance publique. Les migrations au démarrage doivent rester compatibles avec le schéma fourni par le cours ; confirmer toute contrainte de base avant un premier déploiement.

Le remote local `origin` est configuré vers le dépôt GitHub attribué. Avant chaque push, vérifier que les changements locaux souhaités sont inclus sans fichier `.env`, fichier d'accès, jeton ni donnée sensible.

## Tests

Avec Docker :

```bash
docker compose exec backend pytest
```

Ou dans l'environnement Python local du backend :

```bash
cd backend
pytest
```

Les tests utilisent une base SQLite temporaire indépendante ; ils ne lisent ni n'altèrent votre base PostgreSQL.

Vérification de production du frontend :

```bash
cd frontend
npm ci
npm run build
```

## Indice d'usure : limites connues

L'indice estime une distance équivalente pondérée : `distance × facteur terrain × facteur dénivelé`. Les facteurs par défaut sont 1,25 pour la part trail et +3 % par tranche de 100 m de dénivelé positif par kilomètre. Ils sont configurables dans `.env`. Il s'agit d'une heuristique explicable, non d'une mesure scientifique : elle ne prédit pas la durée de vie restante et ne remplace pas l'inspection ou le ressenti. Les pas sont conservés comme donnée facultative mais ne sont pas ajoutés au calcul.

## Limites de la première version

- Pas d'authentification, de partage entre comptes, ni de synchronisation COROS/Strava.
- Les journaux de sorties et d'entretien sont consultables et ajoutables ; la modification/suppression des événements n'est pas encore proposée dans l'interface.
- L'entretien est suivi par kilométrage ; pas de rappel calendaire récurrent dans cette version.
- Le total de distance du tableau de bord additionne les sorties enregistrées depuis GearTrack ; le compteur initial du vélo sert au calcul des échéances, pas à gonfler le total des activités.

## GitHub

Le dépôt est préparé pour un versionnement Git local. Aucun dépôt distant n'est créé ou remplacé et aucun contenu n'est publié ni poussé sans confirmation explicite.
