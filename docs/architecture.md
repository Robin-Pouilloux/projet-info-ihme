# Architecture GearTrack

```mermaid
flowchart LR
    Personne[Utilisateur·rice] -->|Navigateur HTTP| Front[Frontend React + TypeScript / Vite]
    Front -->|/api/*| API[API REST FastAPI]
    API --> ORM[SQLAlchemy]
    ORM --> DB[(PostgreSQL)]
    Migration[Alembic] -->|évolutions versionnées| DB
    Front -.->|/docs via proxy| Docs[Documentation OpenAPI / Swagger]
    Compose[Docker Compose] -.-> Front
    Compose -.-> API
    Compose -.-> DB
    DB --- Volume[(Volume PostgreSQL persistant)]
```

Le frontend est servi par Nginx dans l'image de production et transmet `/api` au backend. En développement, Vite relaie les mêmes chemins vers `localhost:8000`. Les migrations sont exécutées avant le démarrage de FastAPI. Les données ne sont jamais préremplies.
