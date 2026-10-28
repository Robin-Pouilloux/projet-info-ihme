# Architecture GearTrack

```mermaid
flowchart LR
    Personne[Utilisateur·rice] -->|Navigateur HTTP| Front[Frontend React + TypeScript / Vite]
    Front -->|/api/*| API[API REST Express]
    API --> Pool[Pool pg : max 4]
    Pool --> DB[(PostgreSQL)]
    Migration[Migrations SQL idempotentes] -->|ajouts sans suppression| DB
    Front -.->|/docs via proxy| Docs[Page de référence OpenAPI]
    Compose[Docker Compose] -.-> Front
    Compose -.-> API
    Compose -.-> DB
    DB --- Volume[(Volume PostgreSQL persistant)]
```

En production, Express sert le frontend compilé et l'API sur le port 3000. Le proxy du cours retire le préfixe public avant de transmettre les requêtes. En développement, Nginx sert le frontend et relaie `/api` vers Express dans Compose ; Vite relaie les mêmes chemins vers le port hôte GearTrack. Les migrations SQL additives/idempotentes sont exécutées avant l'écoute HTTP. Les données ne sont jamais préremplies.
