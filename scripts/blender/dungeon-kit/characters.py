"""Personnages chibi du donjon (Blender 5.x), en ligne de commande :

    blender -b --factory-startup -P scripts/blender/dungeon-kit/characters.py -- <sortie.raw.glb>

puis `pnpm kit:finish characters` (→ public/models/characters.glb). `pnpm kit`
enchaîne tout ; `pnpm kit:preview characters.py` rend une planche d'aperçu.

Style Ankama (GAMEDESIGN.md §5) : grosse tête, petit corps, yeux immenses,
silhouettes lisibles de loin en vue isométrique. Formes rondes (ellipsoïdes
lissés), couleurs de sommet = albédo (attribut `Col`), l'éclairage toon est
fait à l'exécution.

Un personnage = quelques meshes nommés `C_<id>[_<partie>]` :
- `C_<monstre>` : le corps, en niveaux de gris, TEINTÉ à l'exécution par la
  couleur de l'issue (le matériau multiplie la couleur de sommet) ;
- `C_<monstre>_face` : yeux, bouche, pattes, accessoires, jamais teintés ;
- `C_boss_glow` : les yeux du boss, blancs, teintés et émissifs ;
- `C_hero` / `C_hero_head` : le héros, la tête à part (pivot au cou, à
  `HERO_NECK`) pour l'animation secondaire.

Repère : 1 unité = 1 case, origine au sol sous le personnage, regard vers -Y
de Blender (= +Z de three.js, la direction « sud » du jeu).
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import clear_scene, export, out_path, rgb  # noqa: E402

random.seed(7)  # déterministe

HERO_NECK = 0.34  # = HERO_NECK de src/components/scene/characters.ts

# Palette (sRGB).
INK = "#1B1426"
WHITE = "#FFFFFF"
SKIN = "#F5CDA7"
BLUSH = "#F29A8C"
HAIR = "#E0703A"
TUNIC = "#3559C7"
PANTS = "#2E2A3F"
LEATHER = "#6B4529"
BOOT = "#5A3A22"
LIME = "#C3FB03"
GOLD = "#E8C34A"
STEEL = "#B8C2D6"
BONE = "#EDE3C8"
ROYAL = "#2F4FB0"
ROBE = "#2F89F4"
HAT = "#5B3FA6"
WOOD = "#8A5A2B"
CYAN = "#3FD8F5"


# --------------------------------------------------------------- géométrie

def _layers(bm):
    return [bm.faces.layers.float.get(n) or bm.faces.layers.float.new(n) for n in ("cr", "cg", "cb", "sm")]


def _merge(bm, tmp, color, smooth=True):
    layers = _layers(bm)
    vmap = {v: bm.verts.new(v.co) for v in tmp.verts}
    c = (*rgb(color), 1.0 if smooth else 0.0)
    for f in tmp.faces:
        nf = bm.faces.new([vmap[v] for v in f.verts])
        for layer, value in zip(layers, c):
            nf[layer] = value
    tmp.free()


def _place(tmp, center, rot):
    if rot:
        bmesh.ops.rotate(tmp, verts=tmp.verts, cent=Vector((0, 0, 0)), matrix=Euler(rot, "XYZ").to_matrix())
    bmesh.ops.translate(tmp, vec=Vector(center), verts=tmp.verts)


def blob(bm, center, radii, color, rot=None, segs=(12, 8)):
    """Ellipsoïde lissé : la brique de tous les personnages."""
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    bmesh.ops.scale(tmp, vec=Vector(radii), verts=tmp.verts)
    _place(tmp, center, rot)
    _merge(bm, tmp, color)


def cone(bm, base, radius, depth, color, rot=None, tip_radius=0.0, segs=8, smooth=True):
    """Cône (ou tronc) posé sur sa base en `base`, orienté +Z puis tourné de `rot`."""
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=segs, radius1=radius, radius2=tip_radius, depth=depth)
    bmesh.ops.translate(tmp, vec=Vector((0, 0, depth / 2)), verts=tmp.verts)
    _place(tmp, base, rot)
    _merge(bm, tmp, color, smooth)


def box(bm, size, center, color, rot=None):
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    bmesh.ops.scale(tmp, vec=Vector(size), verts=tmp.verts)
    bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=min(size) * 0.25, segments=1, affect="EDGES", profile=0.5)
    _place(tmp, center, rot)
    _merge(bm, tmp, color, smooth=False)


def ring(bm, center, major, minor, color, segs=16, sides=6, squash=1.0):
    """Tore horizontal (écharpe, ceinture, couronne)."""
    tmp = bmesh.new()
    grid = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        row = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            r = major + math.cos(b) * minor
            row.append(tmp.verts.new((math.cos(a) * r, math.sin(a) * r, math.sin(b) * minor * squash)))
        grid.append(row)
    for i in range(segs):
        for j in range(sides):
            a, b = grid[i][j], grid[(i + 1) % segs][j]
            c, d = grid[(i + 1) % segs][(j + 1) % sides], grid[i][(j + 1) % sides]
            tmp.faces.new([a, b, c, d])
    _place(tmp, center, None)
    _merge(bm, tmp, color)


def eye(bm, center, size, sclera=WHITE, iris=INK, look=(0.0, 0.0)):
    """Œil Ankama : grand blanc, pupille noire, reflet. Regarde vers -Y."""
    x, y, z = center
    w, h = size
    blob(bm, (x, y, z), (w, w * 0.45, h), sclera, segs=(10, 6))
    blob(bm, (x + look[0] * w, y - w * 0.3, z + look[1] * h - h * 0.08), (w * 0.62, w * 0.3, h * 0.7), iris, segs=(8, 5))
    blob(bm, (x + look[0] * w + w * 0.28, y - w * 0.52, z + h * 0.3), (w * 0.22, w * 0.12, w * 0.22), WHITE, segs=(5, 3))


def on_surface(center, radii, x, z, sign=-1.0, inset=0.0):
    """Point de la surface d'un ellipsoïde (face avant par défaut) à (x, z)."""
    cx, cy, cz = center
    rx, ry, rz = radii
    k = 1 - ((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2
    return (x, cy + sign * ry * math.sqrt(max(0.0, k)) * (1 - inset), z)


# ---------------------------------------------------------------- finition

def finish(name, bm, height):
    """bmesh → objet : couleurs de sommet `Col` (couleur × occlusion verticale), lissage par face."""
    bm.normal_update()
    layers = _layers(bm)
    corner_colors, smooth = [], []
    for f in bm.faces:
        base = [f[layer] for layer in layers[:3]]
        smooth.append(f[layers[3]] > 0.5)
        cols = []
        for loop in f.loops:
            # Pieds un peu plus sombres que la tête : lecture du volume sans éclairage.
            t = max(0.0, min(1.0, loop.vert.co.z / height))
            shade = (0.72 + 0.28 * t) * (0.85 if loop.vert.normal.z < -0.6 else 1.0)
            cols.append((base[0] * shade, base[1] * shade, base[2] * shade, 1.0))
        corner_colors.append(cols)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    i = 0
    for cols in corner_colors:
        for c in cols:
            attr.data[i].color = c
            i += 1
    me.color_attributes.active_color = attr
    for poly, s in zip(me.polygons, smooth):
        poly.use_smooth = s
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ------------------------------------------------------------------ héros

def hero():
    """Aventurier façon Iop : tunique bleue, écharpe lime (la couleur du joueur), épée dans le dos."""
    bm = bmesh.new()
    for sx in (-1, 1):
        blob(bm, (sx * 0.075, -0.015, 0.045), (0.06, 0.085, 0.05), BOOT)
        blob(bm, (sx * 0.065, 0, 0.1), (0.045, 0.045, 0.065), PANTS)
    torso = ((0, 0, 0.21), (0.15, 0.13, 0.15))
    blob(bm, *torso, TUNIC)
    ring(bm, (0, 0, 0.165), 0.14, 0.024, LEATHER)
    box(bm, (0.06, 0.03, 0.05), on_surface((0, 0, 0.165), (0.165, 0.155, 1), 0, 0.165), GOLD)
    for sx in (-1, 1):
        blob(bm, (sx * 0.17, 0, 0.22), (0.05, 0.05, 0.085), TUNIC, rot=(0, sx * 0.45, 0))
        blob(bm, (sx * 0.205, -0.02, 0.145), (0.048, 0.048, 0.048), SKIN)
    # Écharpe : tour de cou et deux pans qui flottent derrière.
    ring(bm, (0, 0, 0.325), 0.105, 0.042, LIME, squash=0.8)
    blob(bm, (0.04, 0.13, 0.27), (0.045, 0.025, 0.09), LIME, rot=(-0.5, 0.2, 0))
    blob(bm, (-0.03, 0.15, 0.22), (0.04, 0.022, 0.08), LIME, rot=(-0.8, -0.3, 0))
    # Épée dans le dos, en diagonale.
    box(bm, (0.045, 0.03, 0.34), (0.03, 0.15, 0.27), STEEL, rot=(0, 0.7, 0))
    box(bm, (0.13, 0.04, 0.035), (-0.08, 0.15, 0.39), GOLD, rot=(0, 0.7, 0))
    box(bm, (0.035, 0.035, 0.08), (-0.12, 0.15, 0.44), LEATHER, rot=(0, 0.7, 0))
    body = finish("C_hero", bm, 0.4)

    # Tête, relative au cou.
    bm = bmesh.new()
    head = ((0, 0, 0.2), (0.21, 0.2, 0.19))
    blob(bm, *head, SKIN, segs=(16, 10))
    for sx in (-1, 1):
        blob(bm, (sx * 0.2, 0.01, 0.18), (0.035, 0.04, 0.055), SKIN)
        eye(bm, on_surface(*head, sx * 0.078, 0.165, inset=0.02), (0.05, 0.065), look=(0, 0))
        blob(bm, on_surface(*head, sx * 0.13, 0.11, inset=0.04), (0.035, 0.012, 0.02), BLUSH)
    blob(bm, on_surface(*head, 0, 0.095, inset=0.03), (0.025, 0.012, 0.012), INK)
    # Cheveux : calotte, mèches en pointe vers le haut et l'arrière, frange.
    blob(bm, (0, 0.035, 0.265), (0.218, 0.2, 0.165), HAIR, segs=(16, 10))
    for x, y, rx, ry, depth in ((0, 0.0, -0.35, 0, 0.17), (0.11, 0.02, -0.4, 0.5, 0.14), (-0.11, 0.02, -0.4, -0.5, 0.14),
                                (0.05, 0.12, 0.6, 0.3, 0.14), (-0.06, 0.12, 0.7, -0.3, 0.13), (0, 0.16, 1.1, 0, 0.12)):
        cone(bm, (x, y, 0.36), 0.065, depth, HAIR, rot=(rx, ry, 0))
    for x in (-0.09, 0.0, 0.08):
        cone(bm, (x, -0.13, 0.33), 0.05, 0.1, HAIR, rot=(math.pi * 0.72, 0, 0))
    head_obj = finish("C_hero_head", bm, 0.4)
    return [body, head_obj]


# --------------------------------------------------------------- monstres

def slime():
    bm = bmesh.new()
    body = ((0, 0, 0.17), (0.27, 0.25, 0.19))
    blob(bm, (0, 0, 0.05), (0.3, 0.28, 0.06), "#D0D0D0")
    blob(bm, *body, WHITE, segs=(16, 10))
    cone(bm, (0, 0.02, 0.32), 0.1, 0.13, WHITE, rot=(0.3, 0, 0))
    b = finish("C_slime", bm, 0.42)

    bm = bmesh.new()
    for sx in (-1, 1):
        eye(bm, on_surface(*body, sx * 0.095, 0.2, inset=0.03), (0.065, 0.075), look=(0, -0.1))
    blob(bm, on_surface(*body, 0, 0.1, inset=0.02), (0.06, 0.02, 0.028), INK)
    blob(bm, on_surface(*body, 0, 0.088, inset=0.0), (0.03, 0.01, 0.012), "#E8607A")
    blob(bm, on_surface(*body, -0.14, 0.29, inset=0.03), (0.05, 0.025, 0.028), WHITE, rot=(0.4, 0, 0.6))
    return [b, finish("C_slime_face", bm, 0.42)]


def bug():
    bm = bmesh.new()
    shell = ((0, 0.05, 0.16), (0.2, 0.24, 0.14))
    blob(bm, *shell, WHITE, segs=(16, 10))
    blob(bm, (0, -0.15, 0.17), (0.13, 0.08, 0.1), "#E2E2E2")
    head = ((0, -0.25, 0.15), (0.1, 0.08, 0.09))
    blob(bm, *head, "#C4C4C4")
    b = finish("C_bug", bm, 0.3)

    bm = bmesh.new()
    box(bm, (0.014, 0.4, 0.02), (0, 0.07, 0.297), INK)
    for x, y in ((0.09, 0.0), (-0.1, 0.12), (0.08, 0.17), (-0.08, -0.04)):
        z = shell[0][2] + shell[1][2] * math.sqrt(max(0, 1 - (x / 0.2) ** 2 - ((y - 0.05) / 0.24) ** 2))
        blob(bm, (x, y, z - 0.005), (0.04, 0.04, 0.015), INK, segs=(8, 5))
    for sx in (-1, 1):
        for y in (-0.12, 0.02, 0.15):
            blob(bm, (sx * 0.21, y, 0.07), (0.085, 0.02, 0.02), INK, rot=(0, sx * 0.5, sx * (0.25 if y < 0 else -0.25)), segs=(8, 5))
        cone(bm, (sx * 0.04, -0.29, 0.2), 0.013, 0.17, INK, rot=(0.7, sx * 0.4, 0), segs=6)
        blob(bm, (sx * 0.1, -0.4, 0.33), (0.028, 0.028, 0.028), INK, segs=(8, 5))
        eye(bm, on_surface(*head, sx * 0.05, 0.17, inset=0.05), (0.035, 0.04), look=(sx * 0.2, 0))
    return [b, finish("C_bug_face", bm, 0.3)]


def feature_creep():
    """« Feature creep » : une masse qui accumule les excroissances et les yeux."""
    bm = bmesh.new()
    body = ((0, 0, 0.3), (0.25, 0.24, 0.26))
    blob(bm, *body, WHITE, segs=(16, 10))
    bumps = [((0.2, 0.08, 0.42), 0.11), ((-0.21, 0.04, 0.36), 0.12), ((0.06, 0.16, 0.52), 0.1),
             ((-0.1, -0.08, 0.53), 0.08), ((0.19, -0.1, 0.16), 0.09), ((-0.15, 0.14, 0.13), 0.1)]
    for (x, y, z), r in bumps:
        blob(bm, (x, y, z), (r, r, r * 0.95), "#DADADA" if r < 0.1 else WHITE)
    for (x, y, z), r in bumps[:3]:
        cone(bm, (x * 1.25, y * 1.25, z + r * 0.6), 0.03, 0.09, "#BDBDBD", rot=(y * 3, -x * 3, 0), segs=6)
    for sx in (-1, 1):
        cone(bm, (sx * 0.14, -0.05, 0.05), 0.05, 0.08, "#BDBDBD", rot=(math.pi, 0, 0), segs=6)
    b = finish("C_creep", bm, 0.62)

    bm = bmesh.new()
    eye(bm, on_surface(*body, -0.08, 0.36, inset=0.03), (0.075, 0.085), look=(0.1, 0))
    eye(bm, on_surface(*body, 0.09, 0.4, inset=0.03), (0.05, 0.055), look=(-0.2, 0.1))
    eye(bm, on_surface(*body, 0.06, 0.27, inset=0.03), (0.035, 0.04), look=(0, -0.2))
    eye(bm, (-0.12, -0.15, 0.55), (0.04, 0.045), look=(0.2, 0.2))
    eye(bm, (0.22, -0.06, 0.45), (0.035, 0.04), look=(-0.3, 0))
    mouth = on_surface(*body, 0, 0.17, inset=0.02)
    blob(bm, mouth, (0.09, 0.02, 0.035), INK)
    for x in (-0.05, 0.0, 0.05):
        cone(bm, (x, mouth[1] - 0.012, 0.195), 0.014, 0.03, WHITE, rot=(math.pi, 0, 0), segs=4)
    return [b, finish("C_creep_face", bm, 0.62)]


def sphinx():
    """Sphinx (tireur) : chat assis, coiffe némès or et bleu, gemme frontale."""
    bm = bmesh.new()
    blob(bm, (0, 0.06, 0.17), (0.15, 0.2, 0.16), WHITE)
    for sx in (-1, 1):
        blob(bm, (sx * 0.075, -0.15, 0.04), (0.05, 0.085, 0.04), "#E6E6E6")
        blob(bm, (sx * 0.12, 0.13, 0.08), (0.06, 0.09, 0.07), "#E6E6E6")
    for i in range(5):
        a = i / 4
        blob(bm, (0.04 + a * 0.12, 0.25 + math.sin(a * 2.5) * 0.06, 0.05 + a * a * 0.25), (0.035, 0.035, 0.035), WHITE, segs=(8, 5))
    head = ((0, -0.08, 0.42), (0.15, 0.14, 0.14))
    blob(bm, *head, WHITE, segs=(16, 11))
    blob(bm, on_surface(*head, 0, 0.36, inset=0.15), (0.07, 0.05, 0.045), "#E6E6E6")
    b = finish("C_sphinx", bm, 0.6)

    bm = bmesh.new()
    blob(bm, (0, -0.04, 0.475), (0.168, 0.158, 0.11), GOLD, segs=(16, 10))
    for i, z in enumerate((0.42, 0.36, 0.3, 0.24)):
        for sx in (-1, 1):
            box(bm, (0.07, 0.07, 0.065), (sx * 0.15, -0.05, z), GOLD if i % 2 == 0 else ROYAL)
    for i, x in enumerate((-0.1, -0.05, 0.0, 0.05, 0.1)):
        box(bm, (0.04, 0.03, 0.05), (x, -0.2, 0.5 - abs(x) * 0.25), ROYAL if i % 2 else GOLD)
    blob(bm, (0, -0.225, 0.535), (0.03, 0.02, 0.035), CYAN, segs=(8, 6))
    for sx in (-1, 1):
        eye(bm, on_surface(*head, sx * 0.06, 0.42, inset=0.05), (0.042, 0.032), sclera=GOLD, look=(0, 0))
        box(bm, (0.06, 0.015, 0.012), (sx * 0.1, -0.2, 0.41), INK, rot=(0, sx * 0.35, 0))
    blob(bm, on_surface(*head, 0, 0.375, inset=0.05), (0.018, 0.012, 0.012), "#E8607A")
    return [b, finish("C_sphinx_face", bm, 0.6)]


def goblin():
    bm = bmesh.new()
    for sx in (-1, 1):
        blob(bm, (sx * 0.07, 0, 0.07), (0.045, 0.05, 0.07), "#D8D8D8")
        blob(bm, (sx * 0.075, -0.03, 0.025), (0.05, 0.07, 0.03), "#C8C8C8")
        blob(bm, (sx * 0.17, -0.01, 0.22), (0.042, 0.042, 0.09), WHITE, rot=(0, sx * 0.35, 0))
        blob(bm, (sx * 0.2, -0.03, 0.14), (0.045, 0.045, 0.045), WHITE)
        cone(bm, (sx * 0.17, 0.0, 0.47), 0.065, 0.2, WHITE, rot=(0.15, sx * 1.25, 0))
    blob(bm, (0, 0, 0.2), (0.14, 0.12, 0.13), WHITE)
    head = ((0, -0.01, 0.44), (0.2, 0.17, 0.17))
    blob(bm, *head, WHITE, segs=(16, 11))
    cone(bm, on_surface(*head, 0, 0.42, inset=0.1), 0.04, 0.11, "#E6E6E6", rot=(math.pi / 2 + 0.25, 0, 0))
    b = finish("C_goblin", bm, 0.62)

    bm = bmesh.new()
    blob(bm, (0, 0, 0.16), (0.155, 0.135, 0.085), LEATHER)
    ring(bm, (0, 0, 0.21), 0.13, 0.02, BOOT)
    box(bm, (0.12, 0.03, 0.1), (0, -0.14, 0.12), "#7A4E2D")
    # Gourdin en main droite, clous d'acier.
    cone(bm, (0.2, -0.05, 0.1), 0.028, 0.34, WOOD, rot=(-0.5, 0.25, 0), tip_radius=0.06, segs=8, smooth=False)
    for k in range(3):
        a = k * 2.1
        blob(bm, (0.26 + math.cos(a) * 0.05, -0.2 + math.sin(a) * 0.04, 0.37), (0.02, 0.02, 0.02), STEEL, segs=(6, 4))
    for sx in (-1, 1):
        eye(bm, on_surface(*head, sx * 0.075, 0.46, inset=0.05), (0.05, 0.045), sclera="#F5E04A", look=(-sx * 0.15, 0))
        box(bm, (0.085, 0.02, 0.022), on_surface(*head, sx * 0.08, 0.53, inset=0.0), INK, rot=(0, -sx * 0.4, 0))
        cone(bm, on_surface(*head, sx * 0.06, 0.36, inset=0.03), 0.018, 0.045, WHITE, segs=5)
    blob(bm, on_surface(*head, 0, 0.36, inset=0.02), (0.08, 0.015, 0.018), INK)
    return [b, finish("C_goblin_face", bm, 0.62)]


def boss():
    """Le boss (la plus vieille issue) : colosse trapu couronné, gueule à crocs, yeux qui brûlent."""
    bm = bmesh.new()
    body = ((0, 0, 0.55), (0.42, 0.36, 0.45))
    blob(bm, *body, "#B0B0B0", segs=(18, 12))
    blob(bm, (0, -0.18, 0.32), (0.25, 0.2, 0.2), WHITE)
    for sx in (-1, 1):
        blob(bm, (sx * 0.2, -0.05, 0.08), (0.13, 0.15, 0.09), "#8A8A8A")
        blob(bm, (sx * 0.43, -0.04, 0.52), (0.12, 0.12, 0.21), "#B0B0B0", rot=(0, sx * 0.35, 0))
        blob(bm, (sx * 0.5, -0.1, 0.3), (0.13, 0.13, 0.12), WHITE)
        blob(bm, (sx * 0.33, 0.0, 0.83), (0.13, 0.12, 0.09), WHITE, rot=(0, sx * 0.4, 0))
    b = finish("C_boss", bm, 1.0)

    bm = bmesh.new()
    mouth = on_surface(*body, 0, 0.47, inset=0.02)
    blob(bm, mouth, (0.19, 0.04, 0.065), INK)
    for sx in (-1, 1):
        cone(bm, (sx * 0.12, mouth[1] - 0.025, 0.42), 0.035, 0.09, BONE, segs=6)
        cone(bm, (sx * 0.05, mouth[1] - 0.03, 0.53), 0.022, 0.05, BONE, rot=(math.pi, 0, 0), segs=5)
        box(bm, (0.17, 0.035, 0.035), on_surface(*body, sx * 0.14, 0.8, inset=0.0), INK, rot=(0, -sx * 0.45, 0))
        # Cornes : deux segments, vers l'extérieur puis vers le haut.
        cone(bm, (sx * 0.27, 0.02, 0.88), 0.075, 0.18, BONE, rot=(0, sx * 1.0, 0), tip_radius=0.05)
        cone(bm, (sx * 0.41, 0.02, 0.97), 0.05, 0.16, BONE, rot=(0, sx * 0.25, 0))
    # Couronne : la plus vieille issue garde HEAD.
    ring(bm, (0, 0.02, 0.95), 0.16, 0.03, GOLD, segs=14)
    for k in range(5):
        a = 2 * math.pi * k / 5 + math.pi / 2
        cone(bm, (math.cos(a) * 0.16, 0.02 + math.sin(a) * 0.16, 0.96), 0.04, 0.11, GOLD, segs=4, smooth=False)
    blob(bm, (0, -0.15, 0.98), (0.035, 0.025, 0.035), "#E8384F", segs=(8, 6))
    face = finish("C_boss_face", bm, 1.0)

    bm = bmesh.new()
    for sx in (-1, 1):
        blob(bm, on_surface(*body, sx * 0.13, 0.7, inset=0.03), (0.075, 0.03, 0.045), WHITE, rot=(0, -sx * 0.3, 0), segs=(10, 7))
    glow = finish("C_boss_glow", bm, 1.0)
    return [b, face, glow]


def npc():
    """PNJ (contributeur) : vieux sage, chapeau pointu violet, barbe, bâton à cristal lime."""
    bm = bmesh.new()
    cone(bm, (0, 0, 0), 0.2, 0.42, ROBE, tip_radius=0.1, segs=14)
    ring(bm, (0, 0, 0.03), 0.19, 0.022, GOLD, segs=16)
    for sx in (-1, 1):
        blob(bm, (sx * 0.15, -0.02, 0.3), (0.06, 0.06, 0.1), ROBE, rot=(0.3, sx * 0.3, 0))
        blob(bm, (sx * 0.17, -0.08, 0.22), (0.042, 0.042, 0.042), SKIN)
    head = ((0, -0.02, 0.52), (0.155, 0.145, 0.145))
    blob(bm, *head, SKIN)
    blob(bm, on_surface(*head, 0, 0.46, inset=0.05), (0.115, 0.08, 0.13), "#F4F1EA")
    blob(bm, on_surface(*head, 0, 0.5, inset=0.02), (0.035, 0.03, 0.03), "#E8A88C")
    for sx in (-1, 1):
        blob(bm, on_surface(*head, sx * 0.05, 0.56, inset=0.02), (0.018, 0.01, 0.022), INK, segs=(8, 5))
        blob(bm, on_surface(*head, sx * 0.06, 0.6, inset=0.0), (0.035, 0.02, 0.012), "#F4F1EA", rot=(0, sx * 0.3, 0))
    blob(bm, (0, -0.02, 0.62), (0.22, 0.22, 0.025), HAT)
    cone(bm, (0, -0.01, 0.62), 0.16, 0.2, HAT, tip_radius=0.07)
    cone(bm, (0, 0.0, 0.81), 0.075, 0.15, HAT, rot=(0.7, 0, 0))
    ring(bm, (0, -0.01, 0.65), 0.15, 0.022, LIME, segs=16)
    cone(bm, (0.2, -0.1, 0), 0.022, 0.78, WOOD, tip_radius=0.018, segs=6, smooth=False)
    cone(bm, (0.2, -0.1, 0.76), 0.045, 0.12, LIME, segs=5, smooth=False)
    return [finish("C_npc", bm, 0.95)]


def main():
    path = out_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    clear_scene()
    objects = [*hero(), *slime(), *bug(), *feature_creep(), *sphinx(), *goblin(), *boss(), *npc()]
    for o in objects:
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        print(f"{o.name}: {tris} triangles")
    export(path, objects)
    print("exporté :", path)


if __name__ == "__main__":
    main()
