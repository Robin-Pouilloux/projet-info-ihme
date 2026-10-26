# GearTrack

GearTrack est une application personnelle pour suivre l'entretien des vélos et l'utilisation des chaussures de running/trail. Elle conserve les activités dans PostgreSQL et ne crée aucune donnée de démonstration.

## Architecture

- **Frontend** : React, TypeScript, Vite et Tailwind CSS.
- **Backend** : API REST FastAPI, SQLAlchemy et Pydantic.
- **Données** : PostgreSQL, schéma relationnel et migrations Alembic.
- **Déploiement** : Docker Compose, images frontend/backend et volume PostgreSQL persistant.
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
- Swagger : <http://localhost:8000/docs> (également relayé sur <http://localhost:5173/docs>)
- API : <http://localhost:8000/api>

Les migrations Alembic sont appliquées automatiquement au démarrage du backend. Les données PostgreSQL sont conservées dans le volume `postgres_data`, y compris après l'arrêt des conteneurs. Pour arrêter les services sans supprimer les données : `docker compose down`. La suppression du volume avec `docker compose down -v` efface la base.

Les valeurs de `.env.example` sont des valeurs de développement locales, pas des secrets de production. Ne publiez jamais votre `.env`.

## Développement et migrations

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
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

Vite relaie `/api`, `/docs` et `/openapi.json` vers `http://localhost:8000`.

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
