# My Songless

Blind test personnel basé sur tes playlists Spotify.

## 1. Spotify
1. Crée une application dans le Spotify Developer Dashboard.
2. Copie uniquement le **Client ID**.
3. Dans `app.js`, remplace `YOUR_SPOTIFY_CLIENT_ID`.
4. Dans les Redirect URIs de Spotify, ajoute exactement l'URL de ton site, par exemple :
   - GitHub Pages : `https://TON-USER.github.io/my-songless/`
   - local : `http://127.0.0.1:5500/`

Le projet utilise OAuth Authorization Code + PKCE : **aucun Client Secret n'est nécessaire dans le navigateur**.

## 2. Lancer
Tu peux ouvrir le dossier avec un petit serveur local, par exemple VS Code + Live Server, ou publier directement les trois fichiers sur GitHub Pages.

## 3. Audio
Spotify sert à récupérer les playlists et les métadonnées. Le code cherche ensuite un extrait via l'API de recherche iTunes/Apple. Cela évite de télécharger ou ripper l'audio Spotify.

Attention : les previews Apple ne garantissent pas que l'extrait correspond exactement au début du morceau. Pour une version strictement identique à Songless, il faudra remplacer `setAudioPreview()` par un fournisseur d'extraits autorisé qui fournit le segment voulu.

## 4. Déploiement GitHub Pages
Mets `index.html`, `style.css`, `app.js` et `README.md` dans un dépôt GitHub, puis active GitHub Pages sur la branche principale et le dossier `/root`.
