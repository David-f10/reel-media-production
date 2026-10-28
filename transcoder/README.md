# Worker de transcodage (tranche 1 — inerte)

Master Drive → proxy léger H.264 dans un bucket privé → URL signée expirante.
Ne touche à **aucun** fichier de l'app ni à la voie client. Rien ne l'appelle encore (le branchement à l'envoi et le cron sont la tranche 2).

## Entrée / sortie

```
POST /transcode
  en-tête : x-transcoder-secret: <valeur de TRANSCODER_SHARED_SECRET>
  corps   : { "masterFileId": "<fileId Drive du master>", "versionId": "<id de la version>" }
→ { ok, reutilise, objet, signedUrl, expiresDansSec, dureeMs, debitKbps, codecAudio, tailleProxyOctets }
```

Idempotence : clé d'objet = `proxies/<versionId>__<masterFileId>.mp4`. Un second appel réutilise le proxy sans ré-encoder.

## Variables d'environnement (NOMS seulement — David remplit les valeurs)

Côté worker (Cloud Run) :

| Nom | Rôle |
|---|---|
| `TRANSCODER_SHARED_SECRET` | secret partagé Netlify→worker (l'app l'enverra en tranche 2) |
| `PROXY_BUCKET` | nom du bucket privé où déposer les proxys |
| `DRIVE_SA_JSON` | JSON du compte de service de l'app (lecture Drive). **Le même SA qui a déjà accès au dossier des vidéos → aucun nouveau partage.** À stocker en secret Cloud Run, pas en clair |
| `PROXY_SHORT_EDGE` | petit côté cible (défaut `1080`) |
| `PROXY_VIDEO_KBPS` | débit vidéo cible en kbps (défaut `2500`) |
| `PROXY_TARGET_MB` | *(facultatif)* cap de poids ; si posé, le débit est calculé depuis la durée et borné |
| `PROXY_PRESET` | preset x264 (défaut `slow`) |
| `PROXY_AAC_KBPS` | débit AAC si ré-encodage audio (défaut `128`) |
| `PROXY_SIGNED_URL_TTL_SEC` | durée de validité de l'URL signée (défaut `3600`) |

`PORT` est fourni par Cloud Run.

## Build & déploiement (David exécute ; valeurs à lui)

```
# depuis transcoder/
gcloud builds submit --tag <REGION>-docker.pkg.dev/<PROJET>/<DEPOT>/rmp-transcoder

gcloud run deploy rmp-transcoder \
  --image <REGION>-docker.pkg.dev/<PROJET>/<DEPOT>/rmp-transcoder \
  --region <REGION> \
  --no-allow-unauthenticated \
  --memory 2Gi --cpu 2 --timeout 600 \
  --service-account <SA-RUNTIME>@<PROJET>.iam.gserviceaccount.com \
  --set-env-vars PROXY_BUCKET=<BUCKET>,PROXY_SHORT_EDGE=1080,PROXY_VIDEO_KBPS=2500,PROXY_PRESET=slow \
  --set-secrets TRANSCODER_SHARED_SECRET=<nom-secret>:latest,DRIVE_SA_JSON=<nom-secret>:latest
```

`--memory 2Gi` : le master (plusieurs centaines de Mo) est écrit dans `/tmp`, en mémoire sur Cloud Run. **[S]** à ajuster selon la taille réelle des masters.

## Test à la main, SANS passer par l'app

1. Repasser le master de test en « Restreint » (le worker lit via le SA, pas besoin de lien public).
2. Appeler le service (jeton d'identité Cloud Run + secret partagé) :

```
curl -s -X POST "<URL-CLOUD-RUN>/transcode" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "x-transcoder-secret: <valeur de TRANSCODER_SHARED_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"masterFileId":"<fileId>","versionId":"test-1"}'
```

3. La réponse contient `signedUrl`. Ouvrir cette URL **dans un navigateur** → la vidéo doit se lire.
4. Rejouer la même commande → `reutilise: true` (idempotence, pas de ré-encodage).

### En local (sans Cloud Run)

```
docker build -t rmp-transcoder .
docker run --rm -p 8080:8080 \
  -e TRANSCODER_SHARED_SECRET=<valeur> -e PROXY_BUCKET=<BUCKET> \
  -e DRIVE_SA_JSON="$(cat <chemin-vers-cle-sa.json>)" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/dev/null \
  rmp-transcoder
# puis le même curl sur http://localhost:8080 sans l'en-tête Authorization
```
(l'écriture bucket en local suppose des identifiants GCS locaux ; sinon, tester le bucket depuis Cloud Run)

## Safari / iOS — à vérifier sur un vrai téléphone **[S]**

La lecture `<video>` + URL signée + Range sur Safari/iOS est **la moitié de l'intérêt** du proxy (l'iframe Drive y est cassée), et **je ne peux pas la tester depuis l'environnement de dev**. Une fois la tranche 1 déployée, sur un iPhone :

1. Coller la `signedUrl` directement dans la barre d'adresse de **Safari iOS** → la vidéo doit se lire en ligne (pas un téléchargement).
2. Mieux : une page de test `<video controls playsinline src="<signedUrl>"></video>` → vérifier **lecture**, **déplacement avant/arrière** (= le bucket sert bien le `Range`), et **pas de blocage « fichier à télécharger »**.
3. Confirmer que le `Content-Type` servi est `video/mp4` (iOS est strict). Le worker le pose à l'upload ; à re-vérifier côté bucket.

Si un de ces points échoue, c'est le **service du Range / le Content-Type du bucket** qu'il faut ajuster, pas l'encodage (le master est déjà un domaine `<video>` valide, on ne fait que baisser le débit).
