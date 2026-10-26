# Contribuer à GearTrack

Merci de contribuer à GearTrack.

## Développement

1. Créez une branche dédiée depuis la branche principale.
2. Configurez `.env` à partir de `.env.example` pour les services Docker.
3. Respectez l'organisation frontend/backend et gardez les changements ciblés.
4. Ajoutez ou adaptez des tests pour chaque comportement métier modifié.
5. Exécutez `npm run build` dans `frontend/` et `docker compose exec backend pytest` avant de proposer une modification.
6. Documentez les changements visibles ou les limites nouvelles.

Les messages de commit doivent décrire leur intention. N'ajoutez jamais de secret, de fichier `.env`, de donnée personnelle ou de données réelles d'entraînement.
