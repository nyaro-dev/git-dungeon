# Git Dungeon — plan de projet

> Colle l'URL d'un dépôt GitHub public : son historique devient un donjon
> jouable dans le navigateur, raconté par un maître du jeu IA.

Projet perso, nouveau repo `git-dungeon`. Il sert aussi de quête « réelle » au
portfolio : la carte « Game Dev » et le rôle « Créateur de jeux » y
gagnent enfin une preuve, avec une démo, le code et de vraies captures.

---

## 1. Périmètre

### MVP (v0.1) : ce qui doit marcher à la fin des 4 week-ends

- Saisie d'un repo public `owner/repo`, et génération d'un donjon **déterministe** :
  le même repo au même commit, avec la même version du générateur, donne toujours le même donjon.
- Vue isométrique 3D, déplacement case par case au clavier, à la souris et au tactile.
- Salles = dossiers, coffres = fichiers, monstres = issues ouvertes, boss = la plus
  vieille issue, PNJ = top contributeurs.
- Combat au tour par tour minimal (attaquer / se défendre / fuir).
- Une ligne de narration IA par salle, mise en cache.
- HUD en DOM accessible (PV, loot, dialogue).
- Fin de partie : vaincre le boss qui garde la salle « HEAD », y entrer, puis un écran de
  score et un bouton de partage (image OG).

### Hors MVP (v0.2+)

- Repos privés (OAuth GitHub), classement, sauvegarde de partie.
- PR = portails, branches = étages, releases = boutiques.
- Mode « mon profil » : donjon fait de tous ses repos.
- Son, multijoueur, éditeur.
- HUD Rive, s'il n'a pas pu être fait en bonus au WE 3.

---

## 2. Stack

La même que le portfolio, pour réutiliser les acquis.

| Rôle        | Choix                                                              | Note                                                                                          |
| ----------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| App         | **Next.js 16** (App Router, Turbopack), React 19, TS strict        | ⚠️ conventions Next 16 : `params` en Promise, `proxy.ts`, lire `node_modules/next/dist/docs/` |
| Style       | Tailwind v4                                                        |                                                                                               |
| 3D          | three + **@react-three/fiber 9** + drei                            | `frameloop` piloté (pause hors écran, comme `useVisibleFrameloop` du portfolio)               |
| État de jeu | **zustand** (store pur, sans React dans la logique)                | logique testable hors rendu                                                                   |
| UI animée   | GSAP ; **Rive** en bonus (`@rive-app/react-canvas` ≥ 4.36)         | HUD en DOM d'abord ; Rive = décoration. Vérifier que le runtime `@rive-app/canvas` résolu est ≥ 2.44 (format 7.4) |
| Narration   | **Mastra** + `@ai-sdk/groq` (fallback DeepSeek)                    | agent sans outils, sortie structurée zod, quota                                               |
| Données     | API GitHub REST (+ GraphQL si besoin)                              | token serveur                                                                                 |
| Cache/DB    | **Supabase** Postgres                                              | cache des donjons, de la narration et des quotas ; accès **serveur uniquement** (clé secrète), RLS activée sans politique publique |
| Tests       | **Vitest** + **fast-check**                                        | générateur (tests de propriété) et règles de combat                                           |
| CI          | GitHub Actions : `lint` + `tsc --noEmit` + `vitest` + `next build` | le manque n°1 de l'audit du portfolio                                                         |
| Hébergement | Vercel, déployé dès le jalon 0 (preview par PR)                    | FS en lecture seule : tout cache va dans Supabase                                             |

---

## 3. Architecture

```
URL repo ──▶ /api/dungeon ──▶ GitHub ingest ──▶ RepoSnapshot (JSON)
                                   │                    │
                          cache Supabase ◀──────────────┘
                                                        ▼
                                          generateDungeon(snapshot, seed)   ← pur, testé
                                                        ▼
                                                  DungeonModel
                                 ┌──────────────────────┼─────────────────────┐
                                 ▼                      ▼                     ▼
                        game store (zustand)    Renderer R3F (iso)     Narrator (Mastra)
                        règles, tours, PV       tiles instanciés       /api/narrate, cache
                                 └──────────┬───────────┘
                                            ▼
                                 HUD DOM + GSAP (Rive en bonus)
```

**Principe directeur :** trois couches qui ne se connaissent pas.

1. `lib/ingest` : GitHub → `RepoSnapshot` (I/O, cache, limites).
2. `lib/dungeon` : `RepoSnapshot` → `DungeonModel`. **Fonctions pures, zéro I/O,
   zéro three.js.** C'est le cœur testable.
3. `game/` + `components/` : le jeu et son rendu consomment le modèle.

### Arborescence cible

Le code vit dans `src/` (alias `@/* → ./src/*`) ; les configs restent à la racine.

```
src/
  app/
    page.tsx                     # saisie du repo + exemples
    d/[owner]/[repo]/page.tsx    # partie (?sha=… fige le commit)
    d/[owner]/[repo]/opengraph-image.tsx   # aperçu générique (carte + nom, sans score)
    api/dungeon/route.ts         # snapshot (cache) → JSON
    api/narrate/route.ts         # narration d'une salle (quota)
    api/og/route.tsx             # ImageResponse avec score (lu en query)
  lib/
    ingest/github.ts             # appels REST, normalisation, erreurs typées
    ingest/snapshot.ts           # schéma zod RepoSnapshot
    ingest/repo-name.ts          # validation owner/repo (partagée client/serveur)
    ingest/store.ts              # SnapshotStore (mémoire → Supabase au WE 4)
    ingest/service.ts            # cache + déduplication des ingestions
    ingest/http.ts               # erreur d'ingestion → réponse HTTP
    server/dungeon.ts            # point d'entrée serveur (token, connection())
    dungeon/version.ts           # GENERATOR_VERSION (dans le seed et les clés de cache)
    dungeon/rng.ts               # PRNG seedé (cyrb128 → sfc32) + flux nommés
    dungeon/folders.ts           # arbre des dossiers fusionné (profondeur 3, ≤ 60)
    dungeon/layout.ts            # anneaux carrés + séparation, placement de HEAD
    dungeon/carve.ts             # grille, portes, couloirs A*, murs
    dungeon/populate.ts          # monstres, coffres, PNJ, boss
    dungeon/validate.ts          # invariants (tests + garde de la route d'API)
    dungeon/generate.ts          # orchestration snapshot → DungeonModel
    dungeon/types.ts             # DungeonModel
    game/rules.ts                # combat, loot, stats (pur)
    game/store.ts                # zustand
    narrator/agent.ts            # agent Mastra
    quota.ts                     # repris du portfolio (agent-quota.ts), corrigé
  components/
    debug/DungeonMap.tsx         # vue 2D SVG (page /debug, dev uniquement)
    scene/                       # Canvas, Tiles (InstancedMesh), Hero, Monster
    hud/                         # DOM : PV, loot, dialogue (+ couche Rive en bonus)
public/
  models/dungeon-kit.glb         # kit Blender, meshopt (remplace les primitives)
  models/characters.glb          # personnages chibi (characters.py)
  rive/*.riv                     # bonus
scripts/
  freeze-fixture.ts              # pnpm fixture owner/repo nom → tests/fixtures/nom.json
  blender/dungeon-kit/           # build.py, characters.py, preview.py, finish.mjs (pnpm kit)
tests/
  fixtures/*.json                # snapshots figés (fait main, petit, moyen, monorepo)
  generate.test.ts  generate.prop.test.ts  rules.test.ts  ingest.test.ts
```

---

## 4. Ingestion GitHub

### Appels (REST, token serveur `GITHUB_TOKEN`, 5 000 req/h)

| Donnée                   | Endpoint                                            | Cap                                                                     |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------- |
| Méta, branche par défaut | `GET /repos/{o}/{r}`                                | —                                                                       |
| SHA de HEAD              | `GET /repos/{o}/{r}/commits/{branch}`               | 1                                                                       |
| Arbre de fichiers        | `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1`    | tronqué par GitHub au-delà de ~100k entrées (`truncated: true`) → on garde ≤ 2 000 fichiers, choisis de façon déterministe (tri par chemin, profondeur faible d'abord) |
| Issues ouvertes          | `GET /repos/{o}/{r}/issues?state=open&sort=created&direction=asc&per_page=100` | 100 les plus vieilles, pour que la 1re soit bien le boss (exclure les PR : champ `pull_request`) |
| Commits récents          | `GET /repos/{o}/{r}/commits?per_page=100`           | 100 (messages pour la narration ; **pas de fichiers**)                  |
| Détail des commits       | `GET /repos/{o}/{r}/commits/{sha}`                  | les **25** plus récents → fichiers touchés, donc dossiers « chauds » et commits par salle |
| Contributeurs            | `GET /repos/{o}/{r}/contributors?per_page=10`       | 10 ; un 403 (« history too large ») → repli sur les auteurs des commits |
| Langages                 | `GET /repos/{o}/{r}/languages`                      | —                                                                       |

Environ **31 requêtes** par donjon non caché, soit ~160 donjons/h avec un token. Les détails
de commits sont parallélisés par lots de 5. Cache keyé par `owner/repo@sha` (le snapshot est
immuable pour un sha), avec un TTL de **1 h** sur la résolution « branche → sha » (2 requêtes,
`resolveHead`) : un push récent apparaît vite sans réingérer.

Le cache passe par l'interface `SnapshotStore` (`lib/ingest/store.ts`) : `MemoryStore` (LRU par
instance) jusqu'au WE 4, puis une implémentation Supabase sans toucher au reste. Les ingestions
concurrentes d'une même clé sont dédupliquées. Côté pages, les lectures passent par
`lib/server/dungeon.ts` (`server-only`, `connection()`) : jamais au prérendu ni au préchargement
d'un lien.

> Le listing `/commits` ne donne pas les fichiers modifiés. Sans les 25 appels de détail,
> pas de « commits touchant ce dossier » pour la narration, ni de répartition des monstres
> par activité. Les commits plus anciens ne servent que de texte d'ambiance global.

### `RepoSnapshot` (sortie normalisée)

```ts
type RepoSnapshot = {
  fullName: string;
  sha: string;
  defaultBranch: string;
  stars: number;
  createdAt: string;
  pushedAt: string;
  tree: { path: string; size: number; type: "blob" | "tree" }[]; // ≤ 2000
  issues: {
    number: number;
    title: string;
    comments: number;
    createdAt: string;
    labels: string[];
  }[];
  commits: {
    sha: string;
    message: string; // tronqué à 500 car. à l'ingestion
    date: string;
    author: string;
    files?: string[]; // présent pour les 25 plus récents seulement
  }[];
  truncated: boolean; // arbre tronqué par GitHub ou par notre cap
  contributors: { login: string; avatarUrl: string; contributions: number }[];
  languages: Record<string, number>;
};
```

### Garde-fous

- Repo inexistant ou privé → 404 propre, avec suggestion de repos d'exemple.
- Rate limit GitHub (403/429 avec `x-ratelimit-remaining: 0`) → 429 avec l'heure de reset ;
  un snapshot déjà en cache reste servi.
- Monorepo géant : on fusionne les dossiers profonds (au-delà de la profondeur 3, on remonte au
  parent) et on plafonne à **60 salles** de dossiers (plus la salle HEAD).
- Repo vide ou sans issues → donjon « calme » (monstres génériques « TODO », boss générique
  « Legacy Code »).

---

## 5. Génération du donjon (`lib/dungeon`, pur)

**Seed** = `hash(GENERATOR_VERSION + fullName + sha)` → PRNG `sfc32`. Tout tirage aléatoire
passe par ce PRNG : **jamais `Math.random`**.

**Règles de déterminisme :**

- **Flux nommés** dérivés du seed (`rng.fork("layout")`, `"populate"`, `"narration-fallback"`) :
  ajouter un tirage dans un module ne décale pas les autres.
- **Tris explicites** partout : chemins comparés avec `<` / `>`, **jamais `localeCompare`**, qui
  dépend de l'ICU de la machine. Pas d'itération sur un `Set` ou un `Map` construit dans un ordre
  non trié.
- Ni `Date.now()` ni locale dans `lib/dungeon`. Les dates du snapshot sont des chaînes ISO.
- Changer l'algorithme impose d'incrémenter `GENERATOR_VERSION`. Les anciens caches deviennent
  alors des clés mortes, et les liens partagés ne mentent pas.

### Correspondances

| Repo                                     | Donjon                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Racine du repo                           | Hall d'entrée                                                                                        |
| Dossier (après fusion)                   | Salle ; taille ∝ nombre de fichiers (clamp 5×5 → 11×11)                                              |
| Lien parent → enfant                     | Couloir                                                                                              |
| Fichier volumineux (top 15 % par taille) | Coffre ; rareté selon la taille, type d'objet selon l'extension                                      |
| Langage dominant                         | Thème visuel (palette, props)                                                                        |
| Issue ouverte                            | Monstre (stats au §6) ; label `bug` → type « Bug », `enhancement` → « Feature creep » ; ≤ 3 par salle, 40 au total |
| Plus vieille issue ouverte               | **Boss**, dans l'antichambre de HEAD                                                                 |
| Top 3 contributeurs                      | PNJ (avatar en texture) qui donnent un buff                                                          |
| Dernier commit                           | Salle « HEAD » = sortie, **dédiée** (pas un dossier), accrochée à la salle la plus profonde          |
| Messages de commit                       | Matière première de la narration                                                                     |
| Dossiers touchés par les 25 derniers commits | Salles « chaudes » : priorité pour les monstres                                                  |

### Algorithme de placement

1. Construire l'arbre des dossiers fusionné (≤ 60 nœuds).
2. Placement **arbre radial sur grille** : la racine au centre, les enfants répartis en
   éventail, chaque salle étant un rectangle. Les « cercles » sont des **anneaux carrés**
   (un par profondeur) : arithmétique pure, sans `Math.sin`/`cos`, dont la précision
   varie selon les moteurs JS. Résolution des chevauchements par
   séparation itérative (pousser les rectangles qui se recouvrent), puis snap à la grille.
3. Couloirs en L entre parent et enfant (A\* sur grille si collision).
4. **HEAD** : choisir la salle la plus profonde (distance BFS max depuis l'entrée ; égalité
   départagée par le chemin). Elle devient l'**antichambre du boss**, et on y accroche une petite
   salle HEAD (5×5) par un couloir **unique**, bloqué par une porte scellée tant que le boss vit.
5. Peupler : monstres répartis par poids (salles chaudes d'abord, puis tirage seedé), coffres,
   PNJ près de l'entrée, boss dans l'antichambre. Aucun monstre dans le hall ni dans HEAD.
6. Validation : toutes les salles atteignables (BFS), HEAD atteignable **uniquement** via
   l'antichambre, et aucun chevauchement.

### Tests (Vitest)

- Même snapshot → `DungeonModel` strictement égal (snapshot test).
- Aucune salle qui se chevauche, toutes atteignables, exactement 1 boss et 1 sortie, et le boss
  sur le seul chemin vers HEAD.
- **Tests de propriété** (fast-check) : des snapshots aléatoires (0 à 2 000 fichiers, 0 à 100
  issues, profondeurs extrêmes) respectent tous les invariants ci-dessus.
- Fixtures : 1 fixture écrite à la main, puis 3 vrais repos figés en JSON (petit, moyen,
  monorepo).
- Cas limites : repo vide, repo à 1 seul fichier (hall → antichambre → HEAD), 0 issue (boss
  générique « Legacy Code »).

---

## 6. Gameplay

- **Tour par tour, en grille.** Chaque déplacement coûte 1 tour ; les monstres d'une salle
  bougent après le joueur.
- **Stats héros** : PV 30, ATK 5, DEF 2, niveau. L'XP vient des monstres ; un niveau donne +PV et +ATK.
- **Combat** : `dégâts = max(1, ATK + d6 − DEF)`. Le d6 vient d'un **flux PRNG de partie**,
  distinct de celui de la génération : la partie est rejouable à partir de (seed, liste d'actions).
  Actions : Attaquer, Se défendre (DEF × 2 pendant 1 tour), Fuir (50 %, impossible contre le boss).
- **Stats des monstres** (bornées, `d` = profondeur de la salle depuis l'entrée) :

  | Stat | Monstre                                  | Boss                                   |
  | ---- | ---------------------------------------- | -------------------------------------- |
  | PV   | `clamp(8 + 2×d + 2×√commentaires, 8, 40)` | `max(60, 3 × PV d'un monstre au même d)` |
  | ATK  | `3 + ⌊d/2⌋` (Bug : +1)                   | `6 + ⌊d/2⌋`                            |
  | DEF  | `1 + ⌊d/3⌋` (Feature creep : +1)         | `3 + ⌊d/3⌋`                            |
  | XP   | `5 + d`                                  | —                                      |

  Ces valeurs sont un point de départ : un test de simulation (jouer N parties avec une IA
  gloutonne) vérifie qu'un joueur prudent gagne dans au moins 70 % des cas sur les fixtures.
- **Loot par extension** : `.ts`/`.js` = épées, `.md` = parchemins (soin), `.json`
  = potions, `.css` = armures, binaires = gemmes (score).
- **Fin** : atteindre HEAD, ou mourir. Le score combine salles explorées, issues
  « fermées », loot et nombre de tours.
- `game/rules.ts` est **pur** (state, action) → state. Le store zustand ne fait que
  l'appeler, ce qui le rend testable et rejouable.

---

## 6 bis. Direction artistique (alignée sur le portfolio)

Inventaire fourni par la session du portfolio (`D:\Works\perso\portfolio`).

- **Tokens** : une seule source, `src/lib/theme.ts`, avec ses miroirs CSS dans `globals.css`.
  `tests/theme.test.ts` vérifie qu'ils ne divergent pas et qu'aucun `#C3FB03` n'est codé en dur
  ailleurs (l'accent est dupliqué environ 90 fois dans le portfolio).
- **Couleurs** :
  - fonds `#0a0a0f` / `#12121a` / `#141420`, accent lime `#C3FB03`, contraste `#2F89F4` ;
  - couleurs « issue » par numéro d'issue (monstres) ;
  - rareté or, violet ou bleu (coffres).
- **Typos** : Fredoka pour le texte, Baumans pour les titres (une seule graisse, jamais de
  bold), Geist Mono pour les chiffres.
- **Styles repris** :
  - `.hud-*` de /character : panneaux et plaques de titre du HUD de jeu ;
  - `.qm-*` de /projects : parchemin des cartes de quêtes et des bulles, tome des en-têtes ;
  - `.pi-btn` de la BD : CTA à ombre dure ;
  - `.noise-panel` et `.cta-noise` : panneau vitré et grain.
- **Vocabulaire des quêtes** : « Quête en cours », « Quête scellée », « Quête terminée »,
  rareté, difficulté sur 5.
- **Micro-animations** :
  - GSAP avec les courbes du portfolio (bulles en `y:14` sur 0.4 s `power3.out`, victoire en
    `x:-48, scale:.98` sur 0.45 s) ;
  - Rive (`public/rive/icons.riv`, crâne et étoile du portfolio), chargé à la première
    interaction ;
  - en mouvement réduit : image fixe pour Rive, rien ne joue pour GSAP.

## 7. Rendu 3D

- **Primitives d'abord** (box, plane colorés par type de tile) pour valider le rendu et le
  déplacement au WE 2. Le kit Blender les remplace ensuite sans toucher à la logique : un
  composant par type de tile, une seule interface.
- **Kit Blender low-poly** (fait) : `scripts/blender/dungeon-kit/build.py`, lancé en ligne de
  commande. `pnpm kit` exécute Blender puis gltf-transform meshopt et produit
  `public/models/dungeon-kit.glb` (32 Ko).
  - Prototypes `P_floor`, `P_corridor`, `P_wall`, `P_door`, `P_chest`, `P_pedestal` et
    `P_torch`.
  - Formes et ombrage figé (gris) en couleurs de sommet ; la **teinte** vient de la palette du
    site à l'exécution (couleur d'instance × couleur de sommet).
  - Le GLB étant quantifié, `kit.ts` réécrit les positions en flottants, transformation du
    nœud appliquée.
  - Aperçu : `pnpm kit:preview` (planche Workbench).
- **Personnages chibi** (fait) : `scripts/blender/dungeon-kit/characters.py` (`pnpm kit:chars`,
  inclus dans `pnpm kit`) produit `public/models/characters.glb` (150 Ko) : héros (tête à part,
  pivot au cou), 5 archétypes de monstres, boss, PNJ. Meshes `C_<id>` (corps teinté par
  l'issue) et `C_<id>_face` (non teinté). Aperçu : `pnpm kit:preview characters.py`.
- Avatars des PNJ : texture chargée depuis `avatars.githubusercontent.com` (CORS OK), avec
  repli sur une couleur unie si elle échoue.
- **Tiles en `InstancedMesh`** : un instance set par type de tile, pour quelques draw
  calls seulement, même à 60 salles.
- Caméra iso orthographique qui suit le héros (lerp), zoom à la molette ou au pincement.
- Brouillard de guerre : les salles non visitées sont assombries (uniform par instance).
- Perf : `frameloop="demand"` + `invalidate()` sur changement d'état, DPR
  adaptatif, `PerformanceMonitor`, palier mobile (ombres coupées).
- `prefers-reduced-motion` : transitions instantanées et caméra sans lissage.

## 8. HUD & micro-animations

- **MVP : HUD en DOM** + Tailwind + GSAP. PV en `role="status"`, journal de combat en
  `aria-live="polite"`, bulles de dialogue et pop de loot animées par GSAP. Tout est
  utilisable au clavier et respecte `prefers-reduced-motion`.
- **Bonus WE 3 : couche Rive** par-dessus, sans changer le DOM, seulement si le jalon 3 est
  vert avant. Sinon, elle passe en v0.2.
  - Artboards : `HpBar` (data-bound sur PV), `LootPop`, `DialogBubble`, `BossIntro`.
  - **Leçons du portfolio** : l'export ne prend que l'**artboard actif** (un fichier par
    artboard), supprimer le **fond gris** par défaut des artboards, runtime `@rive-app/canvas`
    **≥ 2.44** pour le format 7.4, WASM auto-hébergé (`RuntimeLoader.setWasmUrl`).
  - Chargé en lazy : le WASM n'entre pas dans le bundle initial.

## 9. Narrateur IA (Mastra)

- Agent Mastra « Maître du donjon », **sans outils ni mémoire**, avec en entrée : le nom de la
  salle, le chemin, jusqu'à 5 messages de commit touchant ce dossier (parmi les 25 commits
  détaillés, sinon les messages récents du repo) et le monstre éventuel.
- Mastra est retenu pour rester cohérent avec le portfolio et préparer la v0.2 (outils,
  mémoire, mode « mon profil »). En MVP, il ne sert qu'à un appel unique en sortie structurée.
- Sortie structurée (zod) : `{ line: string (≤ 140 car.), mood: "calm"|"tense"|"epic" }`.
- Ton : dark fantasy humoristique, en français ou en anglais selon la locale.
- **Cache** Supabase keyé `fullName:roomPath:locale:hash(entrées du prompt + version du prompt)` :
  une salle n'est narrée qu'une fois, tous joueurs confondus, et la narration **survit aux
  commits** qui ne touchent pas la salle (une clé par sha serait invalidée à chaque push).
- **Quota** : reprendre `agent-quota.ts` du portfolio en **corrigeant le bug
  relevé à l'audit**, qui faisait incrémenter le compteur global même sur refus IP. Un test
  unitaire couvre précisément ce cas. Un hit de cache ne consomme pas de quota.
- Fallback sans IA : des templates de phrases tirés au PRNG, pour que le jeu reste
  jouable si le LLM tombe.
- Prompt-injection : les messages de commit sont des **données**, à mettre entre balises et
  à tronquer. L'agent n'a aucun outil.

## 10. Partage

- URL de partie : `/d/{owner}/{repo}?sha=…`. C'est le **sha** qui fige le donjon (le seed s'en
  déduit). Sans `?sha`, on résout la branche par défaut puis on redirige vers l'URL avec sha.
- `d/[owner]/[repo]/opengraph-image.tsx` : mini-carte du donjon en SVG et nom du repo, **sans
  score**. En Next 16, cette convention ne reçoit que `params` (une Promise), pas `searchParams`.
- Partage de score : URL `/d/{owner}/{repo}?sha=…&score=…`. Son `generateMetadata` pointe
  `openGraph.images` vers `/api/og?repo=…&sha=…&score=…` (`ImageResponse`). Le score n'est pas
  vérifié en MVP, puisqu'il n'y a pas de sauvegarde : c'est assumé, et il est borné à
  l'affichage.
- Bouton « Copier le lien » et « Partager sur LinkedIn/X ».

---

## 11. Jalons

| #   | Week-end | Livrable                                            | Critère d'acceptation                                                     |
| --- | -------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| 0   | soir     | Migration `src/`, Vitest, CI, déploiement Vercel     | CI verte (lint, tsc, vitest, build) ; URL de preview en ligne             |
| 1   | WE 1     | Générateur (fixture à la main) → ingestion → vue 2D debug (SVG) | invariants verts en tests de propriété, 3 vraies fixtures valides, aperçu SVG de la carte |
| 2   | WE 2     | Rendu 3D iso **en primitives** + déplacement (kit Blender si le temps le permet) | on parcourt tout le donjon d'un vrai repo au clavier ; 60 fps desktop     |
| 3   | WE 3     | Combat, loot, boss, porte scellée, fin de partie + HUD DOM (Rive en bonus) | partie complète jouable de l'entrée à HEAD ; simulation d'équilibrage verte |
| 4   | WE 4     | Narration IA + cache + quota, image OG, partage      | lien public partageable, coût IA borné, Lighthouse mobile ≥ 80 sur `/` et ≥ 60 sur `/d/…` |
| 5   | bonus    | Intégration portfolio                               | quête « Git Dungeon » avec captures réelles et démo, dans Supabase        |

Chaque jalon donne un commit `feat(...)` taggé `v0.x` et une capture pour le
journal du projet.

---

## 12. Risques & parades

| Risque                       | Parade                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Limite d'API GitHub          | Token serveur, cache par sha, ~31 requêtes par donjon non caché, 429 avec heure de reset |
| Donjon différent du lien partagé | sha dans l'URL, `GENERATOR_VERSION` dans le seed, règles de déterminisme du §5  |
| Équilibrage injouable        | Stats bornées (§6), simulation automatique de parties en CI                         |
| Fuite d'écriture Supabase    | Clé secrète côté serveur uniquement, RLS sans politique publique                    |
| Rive chronophage             | HUD DOM d'abord, Rive en bonus, reportable en v0.2                                  |
| Repos énormes                | Fusion des dossiers, cap de 60 salles et 2 000 fichiers, timeout d'ingestion de 8 s |
| Coût LLM / abus              | Cache par salle, quota corrigé, fallback templates, `maxDuration` sur la route      |
| Perf mobile                  | Instancing, `frameloop="demand"`, palier low, textures ≤ 1024, moteur 3D chargé en lazy (`next/dynamic`, `ssr: false`) hors de `/` |
| Donjons moches (cas limites) | Fixtures variées + vue debug 2D dès le WE 1                                         |
| Scope creep                  | Tout ce qui n'est pas dans le §1 MVP va dans `IDEAS.md`                             |

---

## 13. Démarrage

Le squelette existe déjà (Next 16.4, React 19.3, Tailwind v4, pnpm), mais **sans `src/`**.
Jalon 0, dans l'ordre :

1. Déplacer `app/` vers `src/app/` et passer l'alias à `"@/*": ["./src/*"]` dans `tsconfig.json`.
2. Installer les dépendances du jalon 0 et du WE 1 seulement ; le reste arrive avec le jalon qui
   l'utilise :
   ```bash
   pnpm add zod
   pnpm add -D vitest fast-check
   ```
3. Scripts `package.json` : `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:watch`.
4. `.github/workflows/ci.yml` : `pnpm install --frozen-lockfile` → `lint` → `typecheck` →
   `test` → `build`.
5. Brancher le repo sur Vercel (preview par PR).

Dépendances des jalons suivants :

- WE 2 : `three @react-three/fiber @react-three/drei zustand`, `-D @types/three`
- WE 3 : `gsap @gsap/react` (+ `@rive-app/react-canvas` en bonus)
- WE 4 : `@mastra/core @ai-sdk/groq @supabase/supabase-js` (+ le provider DeepSeek)

Variables d'env (`.env.example`) : `GITHUB_TOKEN`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`,
`SUPABASE_URL`, `SUPABASE_SECRET_KEY` (serveur uniquement, jamais en `NEXT_PUBLIC_`),
`QUOTA_SALT`, `NEXT_PUBLIC_SITE_URL`.

Première tâche concrète : `lib/dungeon/version.ts` + `rng.ts` + `generate.ts` et leurs tests,
sur une fixture JSON écrite à la main. Aucun appel réseau avant que le générateur soit solide.
