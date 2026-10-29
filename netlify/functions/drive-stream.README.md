# drive-stream — relais Range vers `<video>` natif

Relaie **tranche par tranche** les octets d'un master Drive vers une balise `<video>`, le master restant **privé** (aucune permission ouverte ; le compte de service lit côté serveur). Auth = cookie HttpOnly signé posé par `drive-stream-open` (portier complet avant le mint). Le relais ne sert **que** le `fileId` porté par le cookie — jamais un `fileId` venu de la requête.

## Variables d'environnement

- `STREAM_COOKIE_SECRET` — secret HMAC de signature/vérification du cookie. **Obligatoire.**
- `SITE_MONTHLY_CAP_GB` — plafond **mensuel global** de bande passante relayée, en Go. **À régler SOUS le quota réel de l'offre Netlify** (p. ex. offre 100 Go → mettre ~80, pour garder une marge + le trafic de repli). `0` ou absent = plafond désactivé.

## Garde-fous de consommation

Comptés de façon **coarse** (une passe Blobs par palier de 64 Mo, pas par tranche → n'alourdit pas la lecture) :

- **SITE (mensuel, global)** — protège la facture. Atteint → le relais renvoie **509** ; le lecteur **bascule sur l'iframe Drive** (repli), donc l'espace client reste lisible. Le trafic de repli part alors vers Google, pas vers Netlify.
- **CONTACT (quotidien, ~6 Go)** — borne l'abus d'un individu (lien qui circule, lecteur en boucle). Atteint → **429**.
- **Alerte graduée** — à ~70 % et ~90 % du plafond site, un log `ALERTE bande passante` est émis une fois (observabilité).

## ⚠️ Ces plafonds sont FAIL-OPEN

Si Netlify Blobs est indisponible, le comptage **échoue ouvert** : la lecture continue, le plafond n'est PAS appliqué. C'est un choix délibéré — mieux vaut une lecture qui marche qu'un plafond garanti. **Un plafond fail-open est une indication, pas une barrière.** Le filet dur contre le dépassement de facture doit donc être posé AUSSI côté Netlify.

## Notification proactive — à configurer par David (hors code)

Pour être **prévenu AVANT** le dépassement (et pas après), régler une **alerte d'usage dans le dashboard Netlify** (Team → Billing/Usage → alerte e-mail à p. ex. 70 % du quota). C'est l'alerte e-mail native, sans service supplémentaire. Le `SITE_MONTHLY_CAP_GB` de cette fonction est le **plancher dur** qui coupe le relais **avant** que le quota du site soit réellement épuisé ; l'alerte Netlify est l'avertissement en amont.
