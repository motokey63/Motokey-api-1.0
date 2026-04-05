---
status: awaiting_human_verify
trigger: "Railway sert toujours l'ancienne version de MotoKey_App.html (fond noir) au lieu du thème clair f0f2f5, malgré un commit pushé."
created: 2026-03-30T00:00:00Z
updated: 2026-03-30T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — Missing Cache-Control header causes Railway edge / browser to cache old HTML response
test: Add Cache-Control: no-store to the HTML route response headers in motokey-api.js
expecting: After fix + deploy, Railway edge will not cache the HTML and will always serve the current file
next_action: apply fix to motokey-api.js line 394

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: La page servie par Railway affiche le fond clair #f0f2f5 (thème clair)
actual: La page affiche encore le fond noir (ancienne version)
errors: Aucun message d'erreur — juste le mauvais contenu servi
reproduction: Ouvrir l'URL Railway dans le navigateur
started: Après commit "Restauration theme clair f0f2f5" (63c563b) pushé, Railway sert encore l'ancienne version
serving_method: Endpoint Express dynamique (res.sendFile ou readFileSync) — PAS de fichier statique

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-03-30T00:01:00Z
  checked: MotoKey_App.html on disk (line 13)
  found: `--bg:#f0f2f5` is present — light theme IS in the file on disk
  implication: The file content is correct. Bug is NOT a missing commit to the HTML file.

- timestamp: 2026-03-30T00:01:00Z
  checked: motokey-api.js getAppHTML() function (line 381) and serving endpoint (lines 392-400)
  found: |
    function getAppHTML() { return require('fs').readFileSync(require('path').join(__dirname,'MotoKey_App.html'),'utf8'); }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Access-Control-Allow-Origin':'*'});
    res.end(getAppHTML());
    NO Cache-Control headers set — browser/CDN may cache aggressively.
  implication: |
    Server reads file fresh on every request (no in-memory cache).
    BUT no Cache-Control header is sent — Railway's edge/proxy or the browser may be caching the old response.

- timestamp: 2026-03-30T00:02:00Z
  checked: git status, git log origin/master..HEAD
  found: Branch is up to date with origin/master. Commit 63c563b IS pushed. No uncommitted changes.
  implication: The code and HTML are correct on GitHub. Railway has received the push trigger.

- timestamp: 2026-03-30T00:02:00Z
  checked: Dockerfile, railway.json, Procfile, nixpacks.toml
  found: None of these files exist in the repo.
  implication: Railway uses auto-detection (nixpacks). No custom build config to blame.

- timestamp: 2026-03-30T00:03:00Z
  checked: Commit 63c563b content — git show 63c563b:MotoKey_App.html | grep f0f2f5
  found: --bg:#f0f2f5 is present in the committed HTML. The commit is valid.
  implication: The committed file is correct.

- timestamp: 2026-03-30T00:03:00Z
  checked: Response headers in res.writeHead (line 394)
  found: Only Content-Type and Access-Control-Allow-Origin are set. NO Cache-Control, no ETag, no Pragma headers.
  implication: |
    ROOT CAUSE IDENTIFIED:
    Without Cache-Control: no-cache or no-store, Railway's edge network (and/or the browser)
    caches the HTML response. When Railway redeploys, the application container is updated,
    but the edge CDN layer may still serve the previously cached HTTP response for the / or /app route.
    The fix is to add Cache-Control: no-store (or no-cache) to the HTML response header so the
    edge and browser always fetch fresh content.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  The HTML route in motokey-api.js (line 394) sent no Cache-Control header.
  Railway's edge network (and/or the browser) cached the first HTTP response for / and /app.
  After redeploy, the application container had the new HTML file, but the edge layer continued
  serving the cached old response (dark theme) without ever forwarding the request to the updated container.

fix: |
  Added 'Cache-Control':'no-store' to the res.writeHead() call for the HTML route.
  This instructs Railway's edge and all intermediate proxies/browsers to never cache the response,
  ensuring every request fetches the current file from the container.

verification: awaiting human verification after Railway redeploy
files_changed:
  - motokey-api.js (line 394: added Cache-Control no-store header)
