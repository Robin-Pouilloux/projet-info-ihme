# Journal des modifications

Les changements notables du projet sont consignés ici.

## [Non publié]

- Migration du backend actif de FastAPI vers Node.js/Express, avec pool PostgreSQL plafonné à quatre connexions.
- Conservation des routes métier vélos, composants, sorties, entretien, chaussures, évaluations, statistiques, tableau de bord et santé.
- Ajout de migrations SQL non destructives et de tests d'API avec PostgreSQL en mémoire.
- Adaptation de l'image de production au port `3000` et au sous-chemin IHME.
- Le prototype COROS Python reste conservé mais n'est pas exposé par le backend Express.

## [1.0.0] — 2026-10-26

- Première version : tableau de bord, suivi des vélos, composants, sorties et entretiens.
- Suivi des chaussures, sorties, surfaces et évaluations physiques.
- Indice d'usure heuristique paramétrable, distinct du kilométrage réel.
- Version initiale du backend FastAPI avec schéma PostgreSQL, migrations Alembic et tests pytest.
