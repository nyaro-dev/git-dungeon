# Git Dungeon — game design

> Document de référence du gameplay (v1). Il remplace le §6 « Gameplay » de `PLAN.md`
> (combat attaquer / défendre / fuir avec d6). Sources de la recherche en fin de document.

**Promesse :** une run de 8–15 min où chaque salle est une petite énigme tactique à la Dofus,
où rien n'est dû au hasard pendant le combat, et où explorer rapporte toujours quelque chose.

---

## 1. Principes

1. **Zéro hasard en combat.** Dégâts fixes : `max(1, puissance + ATK − DEF)`. Le PRNG seedé ne
   sert qu'à la génération et au loot. On peut donc **prévisualiser exactement** chaque coup
   (« 12 → 7 PV ») avant de cliquer. Une mort est toujours « de la faute du joueur » (Into the
   Breach).
2. **Tout se voit avant d'agir** : intention de chaque ennemi (icône + chiffre, Slay the
   Spire), cases menacées au sol, frise d'initiative, portée et ligne de vue des sorts.
3. **Une salle = une arène.** Pas de phase de placement : les monstres sont déjà placés (seed),
   le combat démarre quand le héros entre dans une salle qui contient des monstres vivants.
4. **Hors combat, mouvement libre** (déjà en place) : on ne compte pas ses pas en explorant.
5. **La position fait les deux tiers de la puissance** : tacle, poussée contre un mur, ligne de
   vue, piliers. Le tour est un puzzle spatial court.
6. **Une récompense toutes les 30–45 s** : coffre, autel, secret, événement de commit.

---

## 2. Combat « Dofus-lite »

### Tour du héros

- **6 PA** (actions) et **3 PM** (1 case = 1 PM) par tour, rechargés à chaque tour.
- **30 PV** de base, ATK 0, DEF 0 ; le loot les fait monter.
- Le joueur enchaîne librement déplacements et capacités, puis « Fin de tour » (bouton, ou
  Espace / Entrée).
- Pas de minuteur (jeu de portfolio, lecture d'abord).

### Règles de position

| Règle | Effet |
|---|---|
| **Tacle** | Quitter une case adjacente à un ennemi coûte +1 PM par ennemi adjacent (certains ont Tacle 2). |
| **Poussée** | Un ennemi poussé contre un mur prend **3 dégâts par case non parcourue**. S'il heurte un autre ennemi : 2 dégâts par case, aux deux. |
| **Ligne de vue** | Bresenham sur la grille ; murs, piliers et entités bloquent. Cases ciblables surlignées. |
| **Initiative** | Héros, puis ennemis par numéro d'issue croissant (le plus vieux joue d'abord). Frise avec portraits. |
| **Dos** *(plus tard)* | +25 % de dégâts dans le dos (Wakfu). |

### Capacités (4 emplacements)

**1. Arme, déterminée par le langage dominant du repo**

| Langage | Arme | Coût | Portée | Effet |
|---|---|---|---|---|
| TS / JS | Fouet de Promesses | 3 PA | 1–3 en ligne | 4 dégâts, attire de 1 |
| Python | Morsure du Serpent | 3 PA | 2–4 | 3 dégâts + poison 2/tour pendant 2 tours |
| Rust | Marteau Borrow | 4 PA | 1 | 7 dégâts, pousse de 2 |
| Go | Goroutines | 2 PA | 1–2 | 2 frappes de 2 |
| C / C++ | Pointeur | 3 PA | 2–6 en ligne | 5 dégâts, ignore la ligne de vue, 1 dégât à soi |
| Autre | Bâton générique | 3 PA | 1–2 | 4 dégâts |

**2. Mobilité fixe — « Checkout »** : 2 PA, saut de 2 cases sans tacle, 1 fois par tour.

**3–4. Sorts trouvés dans les coffres** (l'extension du fichier donne le sort, sa taille le rang)

| Extension | Sort | Coût | Effet |
|---|---|---|---|
| .md | Parchemin | 3 PA | Soin 8, 1 fois par combat |
| .json / .yml | Glyphe de config | 2 PA | Zone 3×3 : 4 dégâts à tout ennemi qui y finit son tour |
| .sh / scripts | Script | 2 PA | Pousse de 3 en ligne (le combo avec les murs) |
| .png / .svg | Flash | 2 PA | Annule l'intention d'un ennemi |
| .lock *(plus tard)* | Verrou | 2 PA | La cible perd ses PM 1 tour |
| tests *(plus tard)* | Assert | 1 PA | La prochaine attaque reçue −5 |

Ramasser un sort quand les deux emplacements sont pleins : on choisit lequel remplacer.

### Ennemis

Repères : un sbire a 8–12 PV, 2 PM, frappe pour 3–4. Objectif : un combat dure **3–5 tours
(60–90 s)**. Les stats montent un peu avec l'issue (+1 PV par réaction 👍, plafonné à +6 ;
donnée à ajouter à l'ingestion).

| Label | Monstre | PV | PM | Comportement (intention toujours affichée) |
|---|---|---|---|---|
| good first issue | **Slime** | 4 | 2 | Mêlée 2. Double loot. Monstre tutoriel de la première salle. |
| bug | **Bug** | 6 | 3 | Mêlée 3. **Se duplique** s'il n'est pas tué en 3 tours (compte à rebours visible). |
| enhancement / feature | **Feature Creep** | 14 | 1 | +1 ATK par tour. **Charge** télégraphiée sur une ligne entière : on esquive ou on le redirige. |
| question | **Sphinx** | 7 | 2 | Distance 2–5, 3 dégâts, a besoin de la ligne de vue, fuit le contact. |
| *(sans label reconnu)* | **Goblin** | 10 | 2 | Mêlée 4. |
| documentation *(plus tard)* | Scribe | 8 | 1 | N'attaque pas ; bouclier de 3 à un allié par tour. |
| stale / > 1 an *(plus tard)* | Revenant | 10 | 2 | Revient à 50 % 2 tours après sa mort, sauf s'il meurt contre un mur. |
| duplicate *(plus tard)* | Mimic | — | — | Copie le comportement de son voisin. |
| help wanted *(plus tard)* | Héraut | 8 | 1 | Appelle un sbire au tour 3 (télégraphié). |

### Boss : la plus vieille issue ouverte

- **PV** = 40 + 3 × min(commentaires, 20).
- **Intro** : titre de l'issue, « ouverte il y a N ans », compteur de commentaires qui défile.
- **Phase 1 « Triage »** : frappe sur 3 cases en ligne (télégraphiée) ; invoque un monstre du
  label le plus fréquent du repo tous les 3 tours.
- **Phase 2 « Discussion »** (sous 50 % PV) : chaque tour, des cases « commentaire » sont
  marquées et explosent au tour suivant pour 6 dégâts.
- **Point faible** : poussé contre un pilier « LGTM » de l'arène, il est étourdi 1 tour.
- *(Plus tard)* phase 3 « Necrobump » si beaucoup de commentaires : double intention, arène qui
  rétrécit.

### Fin de combat, mort, progression

- Monstre vaincu = « Issue #N closed ✓ », butin projeté. Les PV ne remontent pas entre les
  salles (sauf fontaines / sorts) : la tension s'accumule.
- Mort du héros = écran « Merge conflict », relancer la run (même donjon, déterministe).
- Victoire = entrer dans HEAD après le boss.

---

## 3. Exploration

- **Rythme** : 8–14 salles, un temps fort toutes les 30–45 s.
- **Révélation** : à l'entrée, le brouillard se dissipe **en vague depuis la porte** (~0,4 s),
  le nom du dossier s'affiche, la narration du commit défile en machine à écrire. Les salles
  voisines apparaissent en silhouette avec un « ? » sur la mini-carte.
- **Secrets = dotfolders** (`.github`, `.vscode`, `.husky`…) : salle cachée derrière un mur
  fissuré, avec des particules de courant d'air. Heurter le mur l'ouvre. Toujours optionnelle
  (règle de Shattered Pixel Dungeon) : consommable rare ou sort de rang +1.
- **Clé HEAD** : une seule porte verrouillée à la fois (Ocarina of Time). L'entrée de
  l'antichambre du boss demande la Clé HEAD, gardée dans le plus gros coffre du plus gros
  dossier.
- **Événements de commit** : chaque salle prend le préfixe Conventional Commit de son commit
  le plus récent :
  - **fix** : fontaine, +8 PV, une fois ;
  - **revert** : portail vers la dernière salle visitée (raccourci) ;
  - **feat** : coffre bonus ;
  - *(plus tard)* **docs** révèle 2 salles sur la carte, **wip** pose un piège visible,
    **BREAKING** amène un élite et un coffre de rang supérieur, **merge** relie deux salles par
    une paire de portails.
- **Autels de contributeurs** *(plus tard)* : choix entre 2 bénédictions (+1 PA, +2 PM,
  +5 PV max).
- **Complétion** : % = salles + secrets + coffres. À 100 % : badge « Working tree clean ».
  L'écran de fin est une carte partageable (temps, %, issues fermées).
- **Narration par le décor** *(plus tard)* : `tests/` reçoit des mannequins, `assets/` une
  galerie, un dossier sans commit depuis plus d'un an des toiles d'araignée, un README une
  stèle lisible.

---

## 4. Juice par événement

| Événement | Effets |
|---|---|
| Déplacement | Saut étiré puis écrasé (fait), poussière (fait), caméra qui suit avec retard (fait) |
| Visée | Portée et ligne de vue au sol, PV fantômes « 12 → 7 » sur la cible, intention mise en avant |
| Attaque | Anticipation : le personnage se ramasse 120 ms, puis s'élance |
| Coup | Hitstop de 60 ms (120 ms si lourd), flash blanc d'1 frame, chiffre de dégâts qui rebondit, recul, tremblement ∝ dégâts |
| Poussée dans un mur | Hitstop de 100 ms, tremblement fort, débris, « BONK » orange |
| Mort | Ralenti ×0,3 pendant 150 ms, gerbe à la couleur de l'issue, butin en arc (piñata), « Issue #N closed ✓ » |
| Coffre | Le couvercle tremble, faisceau de la couleur de rareté, objets qui rebondissent |
| Nouveau sort | Gel de 0,3 s, anneau de lumière, la carte du sort vole vers la barre |
| Salle révélée | Vague de brouillard, nom du dossier, narration |
| Secret | Mur qui s'effondre, clochette, compteur de secrets +1 |
| Boss | Caméra qui se rapproche, barre de PV qui se remplit, carton titre ; au changement de phase, tremblement et teinte rouge |
| Victoire | Ralenti sur le dernier coup, porte HEAD qui s'ouvre, confettis, % qui défile |

Tout effet respecte `prefers-reduced-motion` : pas de tremblement ni de ralenti, des
particules réduites, les chiffres restent.

---

## 5. Direction visuelle : « le Néant du dépôt »

Validé : univers d'**îles flottantes** à la Wakfu / Dofus / Waven.

- **Une salle = une île** de pierre moussue au-dessus d'un vide indigo étoilé. Ses flancs sont
  des strates (l'historique des commits : plus anciennes = plus sombres et violettes), des racines
  pendent dessous, des rochers flottent autour.
- **Couloirs = ponts de planches** suspendus ; **portes = arches** avec bannière ; **murs =
  rebords** bas de pierre moussue qui ne cachent jamais le jeu.
- **Cristaux** groupés près des bords, colorés par le langage dominant.
- **Lumière** : torches chaudes contre clair de lune froid ; ombres colorées (`#3A2E5C`),
  jamais grises.

**Piliers de style**
1. Valeurs avant couleurs : sol désaturé de valeur moyenne, personnages et interactifs clairs
   et saturés, vide très sombre.
2. Ombres colorées : les bandes d'ombre du toon tirent vers le violet.
3. Contours sombres colorés (`#1B1426`), plus épais sur les entités que sur le décor.
4. Formes chibi et chanfreinées, jitter de hauteur et de rotation sur les dalles.
5. Tout respire : herbe, flammes, particules, idle des personnages (amplitudes faibles).
6. Le lime (`#C3FB03`) est réservé au héros et à l'interactif.
7. Diorama : chaque île est finie, avec un bord visible qui plonge dans le vide.

**Pile de rendu** : `MeshToonMaterial` étendu (gradient en 3 bandes, teinte d'ombre, rim
light, dégradé vertical, bruit « peint » procédural) ; contours en coque inversée sur les
entités ; post-traitement (`postprocessing` 6.39 / `@react-three/postprocessing` 3.1) avec
Bloom sélectif, Vignette, étalonnage, SMAA sur desktop ; vie ambiante dans les shaders
(`uTime` partagé), sans réécrire de matrices à chaque frame.

## 6. Découpage de l'implémentation

| Lot | Contenu | Critère |
|---|---|---|
| **A. Combat cœur** ✅ | Tours, PA/PM, initiative, arme selon le langage, Checkout, dégâts fixes avec aperçu, ligne de vue, tacle, poussée, mort/victoire, 5 archétypes avec intentions | Une salle de combat se gagne et se perd ; règles pures et testées |
| **B. Boss** ✅ | Boss en 2 phases, piliers LGTM, intro | Combat de boss complet |
| **C. Loot et sorts** ✅ | Coffres qui donnent les 4 sorts MVP, rangs, remplacement d'emplacement | Les choix de build changent le combat |
| **D. Exploration** ✅ | Vague de brouillard, secrets dotfolders, Clé HEAD, événements fix/revert/feat, % de complétion, mini-carte | Run complète de 8–15 min |
| **E. Juice combat** ✅ (reste : flash blanc à l'impact, piñata de coffre) | Hitstop, chiffres de dégâts, flash, piñata, ralenti, intro boss | La checklist du §4 est cochée |

Personnages chibi ✅ : `scripts/blender/dungeon-kit/characters.py` (héros, 5 monstres, boss,
PNJ) → `public/models/characters.glb`. Les corps des monstres sont en gris, teintés par la
couleur de leur issue à l'exécution ; visages et accessoires gardent leurs couleurs.

Les lots A à C sont des règles pures `(état, action) → état`, testées avant tout rendu. Les
changements du générateur (piliers, secrets, clé) incrémentent `GENERATOR_VERSION`.

---

## Sources

Dofus (bases du combat) https://dofus.jeuxonline.info/article/1720 · Tacle déterministe
https://dofus.jeuxonline.info/actualite/30452/devblog-tacle-deterministe · Poussée
https://www.gamosaurus.com/?p=170038 · Wakfu https://wakfu.wiki.gg/wiki/Fight et
https://wakfu.wiki.gg/wiki/Backstab · Waven https://www.pockettactics.com/waven/review · Into the
Breach https://gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i-
· Slay the Spire (intentions) https://sts2.untapped.gg/guides/how-to-read-enemy-intent · Hoplite
https://www.pocketgamer.com/hoplite/review/ · Crypt of the NecroDancer
https://scientificgamer.com/thoughts-crypt-of-the-necrodancer/ · Shattered Pixel Dungeon
(secrets) https://shatteredpixel.com/blog/coming-soon-to-shattered-better-secrets.html · Boss
Keys (Mark Brown)
https://zeldauniverse.net/2017/01/26/explore-zelda-dungeon-design-in-mark-browns-youtube-series-boss-keys/
· Darkest Dungeon https://darkestdungeon.wiki.gg/wiki/Light_meter · Hades
https://www.pcgamer.com/hades-review · Juice it or lose it https://www.youtube.com/watch?v=Fy0aCDmgnxg
· The Art of Screenshake https://www.youtube.com/watch?v=AJdEqssNZ-U et https://infovore.org/?p=5275
· Hitstop https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/
