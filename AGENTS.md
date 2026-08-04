# Instructions obligatoires pour les travaux sur ce depot

Pour toute analyse ou modification qui touche les commandes, ECOTRACK/DHD,
Sook, les statuts, Google Sheets, MongoDB, Vercel, le stock ou la page
`front/src/pages/Orders.tsx` :

1. Lire integralement `DHD_ECOTRACK_FIX_REFERENCE.md` avant toute modification.
2. Identifier dans ce document l'etape et les anomalies concernees.
3. Verifier les faits dans le code actif et dans
   `ECOTRACK API.postman_collection.json`; ne jamais se fier aux copies
   `Orders.tsx.copy`, `front/src/Orders.tmp` ou a un souvenir de l'API.
4. Ne jamais recopier un token, une cle privee ou une donnee client dans une
   sortie, un test, un log, une documentation ou un commit.
5. Apres chaque modification, mettre a jour dans
   `DHD_ECOTRACK_FIX_REFERENCE.md` : l'etat de l'etape, les fichiers touches,
   les tests executes, leurs resultats et toute decision nouvelle.
6. Ne marquer une anomalie ou une etape terminee que si ses criteres de
   validation sont satisfaits avec une preuve reproductible.
7. Si le code, la documentation officielle et ce document se contredisent,
   suspendre l'hypothese, consigner la contradiction et verifier le contrat
   avant de continuer.

