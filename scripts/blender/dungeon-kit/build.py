"""Kit du donjon « Néant du dépôt » (Blender 5.x), en ligne de commande :

    blender -b --factory-startup -P scripts/blender/dungeon-kit/build.py -- <sortie.raw.glb>

puis `pnpm kit:finish` (gltf-transform meshopt → public/models/dungeon-kit.glb).
`pnpm kit` enchaîne les deux ; `pnpm kit:preview` rend une planche d'aperçu.

Style Ankama (GAMEDESIGN.md §5) : formes chanfreinées et un peu irrégulières,
couleurs saturées, couleurs de sommet = albédo (attribut `Col`). L'éclairage est
fait à l'exécution par un shader toon : ici, seule une légère occlusion figée
(dessous plus sombres). Les pièces à teinter à l'exécution (cristaux, flammes,
garnitures de coffre selon la rareté) sont en blanc.

Conventions du pipeline du portfolio : un mesh par prototype nommé `P_<id>`,
export GLB `export_yup`. Repère : 1 unité = 1 case, origine au centre de la case
au niveau du sol ; le passage d'un pont ou d'une porte suit l'axe Y de Blender
(Z dans three.js).
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

random.seed(42)  # déterministe : deux builds donnent le même GLB

FLOOR_THICKNESS = 0.12
PARAPET_HEIGHT = 0.32  # = PARAPET_HEIGHT de src/components/scene/Tiles.tsx

# Palette (sRGB), issue de la recherche « look Ankama ».
STONE = "#8C8A7A"
STONE_DARK = "#6E6A5E"
WALL_STONE = "#6B6F86"
WALL_CAP = "#9AA0B8"
MOSS = ["#3E6B2A", "#5A8F2E", "#7BBF3A"]
GRASS_BASE, GRASS_TIP = "#3E6B2A", "#A8D84A"
PLANK = ["#A0703F", "#94653A", "#8A5D33"]
BEAM = "#6B4529"
WOOD = "#8A5A2B"
METAL = "#C9A54A"
BANNER = "#5B3FA6"
ROCK = "#5A4A3E"
WHITE = "#FFFFFF"


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hexstr):
    h = hexstr.lstrip("#")
    return tuple(srgb_to_lin(int(h[i : i + 2], 16) / 255.0) for i in (0, 2, 4))


def out_path():
    argv = sys.argv
    if "--" in argv and len(argv) > argv.index("--") + 1:
        return os.path.abspath(argv[argv.index("--") + 1])
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "dungeon-kit.raw.glb"))


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


# --------------------------------------------------------------- géométrie

def _layers(bm):
    return [bm.faces.layers.float.get(n) or bm.faces.layers.float.new(n) for n in ("cr", "cg", "cb")]


def _merge(bm, tmp, color, top_color=None):
    """Copie `tmp` dans `bm` ; chaque face garde sa couleur (`top_color` pour les faces vers le haut)."""
    layers = _layers(bm)
    vmap = {v: bm.verts.new(v.co) for v in tmp.verts}
    tmp.normal_update()
    for f in tmp.faces:
        nf = bm.faces.new([vmap[v] for v in f.verts])
        c = rgb(top_color if top_color and f.normal.z > 0.7 else color)
        for layer, value in zip(layers, c):
            nf[layer] = value
    tmp.free()


def add_box(bm, size, center, color, bevel=0.0, segments=1, top_color=None, jitter=0.0, rot_z=0.0):
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    bmesh.ops.scale(tmp, vec=Vector(size), verts=tmp.verts)
    if jitter:
        for v in tmp.verts:
            v.co += Vector((random.uniform(-jitter, jitter), random.uniform(-jitter, jitter), random.uniform(-jitter, jitter) * 0.5))
    if rot_z:
        bmesh.ops.rotate(tmp, verts=tmp.verts, cent=Vector((0, 0, 0)), matrix=_rot_z(rot_z))
    bmesh.ops.translate(tmp, vec=Vector(center), verts=tmp.verts)
    if bevel > 0:
        bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=segments, affect="EDGES", profile=0.5)
    _merge(bm, tmp, color, top_color)


def add_prism(bm, radius, height, center, color, sides=6, tip=0.0, tilt=(0.0, 0.0)):
    """Prisme à `sides` côtés, éventuellement pointu (`tip` = hauteur de la pointe)."""
    tmp = bmesh.new()
    bottom, top = [], []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        x, y = math.cos(a) * radius, math.sin(a) * radius
        bottom.append(tmp.verts.new((x, y, 0)))
        top.append(tmp.verts.new((x * 0.85, y * 0.85, height)))
    tmp.faces.new(list(reversed(bottom)))
    for i in range(sides):
        j = (i + 1) % sides
        tmp.faces.new([bottom[i], bottom[j], top[j], top[i]])
    if tip > 0:
        apex = tmp.verts.new((0, 0, height + tip))
        for i in range(sides):
            tmp.faces.new([top[i], top[(i + 1) % sides], apex])
    else:
        tmp.faces.new(top)
    bmesh.ops.rotate(tmp, verts=tmp.verts, cent=Vector((0, 0, 0)), matrix=_rot(tilt))
    bmesh.ops.translate(tmp, vec=Vector(center), verts=tmp.verts)
    _merge(bm, tmp, color)


def add_rock(bm, radius, center, color, squash=0.7):
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=radius)
    for v in tmp.verts:
        v.co *= 1 + random.uniform(-0.22, 0.22)
        v.co.z *= squash
    bmesh.ops.translate(tmp, vec=Vector(center), verts=tmp.verts)
    _merge(bm, tmp, color)


def add_blade(bm, base, height, width, lean, angle):
    """Brin d'herbe : triangle effilé, base foncée, pointe claire (dégradé par sommet)."""
    layers = _layers(bm)
    dx, dy = math.cos(angle) * width / 2, math.sin(angle) * width / 2
    lx, ly = math.cos(angle + math.pi / 2) * lean, math.sin(angle + math.pi / 2) * lean
    a = bm.verts.new((base[0] - dx, base[1] - dy, 0))
    b = bm.verts.new((base[0] + dx, base[1] + dy, 0))
    c = bm.verts.new((base[0] + lx, base[1] + ly, height))
    # Une seule face : l'herbe est rendue avec un matériau double face (side: DoubleSide).
    f = bm.faces.new([a, b, c])
    for layer, value in zip(layers, rgb(GRASS_BASE)):
        f[layer] = value
    # La pointe est éclaircie dans finish() selon la hauteur (dégradé vertical).


def _rot(tilt):
    from mathutils import Matrix

    return Matrix.Rotation(tilt[0], 3, "X") @ Matrix.Rotation(tilt[1], 3, "Y")


def _rot_z(a):
    from mathutils import Matrix

    return Matrix.Rotation(a, 3, "Z")


def finish(name, bm, gradient=None, ao=True):
    """bmesh → objet `name` avec couleurs de sommet `Col` (couleur de pièce × occlusion légère).

    `gradient=(couleur_bas, couleur_haut, h)` : dégradé vertical (herbe, cristaux).
    """
    bm.normal_update()
    layers = _layers(bm)
    me = bpy.data.meshes.new(name)
    corner_colors = []
    for f in bm.faces:
        base = [f[layer] for layer in layers]
        shade = 1.0 if not ao else (0.62 if f.normal.z < -0.7 else (0.93 if f.normal.z < 0.7 else 1.0))
        cols = []
        for loop in f.loops:
            c = base
            if gradient:
                t = max(0.0, min(1.0, loop.vert.co.z / gradient[2]))
                lo, hi = rgb(gradient[0]), rgb(gradient[1])
                c = [lo[i] + (hi[i] - lo[i]) * t for i in range(3)]
            cols.append((c[0] * shade, c[1] * shade, c[2] * shade, 1.0))
        corner_colors.append(cols)
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    i = 0
    for cols in corner_colors:
        for c in cols:
            attr.data[i].color = c
            i += 1
    me.color_attributes.active_color = attr
    for poly in me.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ------------------------------------------------------------- prototypes

def floor_tile():
    bm = bmesh.new()
    # Dalle légèrement irrégulière : le jitter casse la grille parfaite.
    add_box(bm, (0.95, 0.95, FLOOR_THICKNESS), (0, 0, -FLOOR_THICKNESS / 2), STONE_DARK, bevel=0.035, top_color=STONE, jitter=0.012)
    return finish("P_floor", bm)


def bridge():
    bm = bmesh.new()
    # Planches en travers du passage (qui suit Y), deux longerons dessous, poteaux de corde.
    for i, y in enumerate((-0.33, 0.0, 0.33)):
        add_box(bm, (0.92, 0.28, 0.06), (random.uniform(-0.02, 0.02), y, -0.03), PLANK[i % 3], bevel=0.015, jitter=0.01,
                rot_z=random.uniform(-0.04, 0.04))
    for sx in (-1, 1):
        add_box(bm, (0.08, 1.0, 0.08), (sx * 0.36, 0, -0.1), BEAM, bevel=0.015)
        add_box(bm, (0.06, 0.06, 0.34), (sx * 0.45, 0.42, 0.11), BEAM, bevel=0.01)
    return finish("P_bridge", bm)


def parapet():
    bm = bmesh.new()
    # Rebord bas de pierres taillées, chapeau clair, mousse par plaques sur le dessus.
    joints = [-0.5, -0.12, 0.2, 0.5]
    for x0, x1 in zip(joints, joints[1:]):
        h = PARAPET_HEIGHT * random.uniform(0.85, 1.0)
        add_box(bm, (x1 - x0 - 0.03, 0.9, h), ((x0 + x1) / 2, 0, h / 2), WALL_STONE, bevel=0.04, top_color=WALL_CAP, jitter=0.015)
    for _ in range(3):
        x, y = random.uniform(-0.35, 0.35), random.uniform(-0.3, 0.3)
        add_box(bm, (random.uniform(0.18, 0.3), random.uniform(0.18, 0.3), 0.05), (x, y, PARAPET_HEIGHT * 0.9),
                random.choice(MOSS), bevel=0.02, jitter=0.02)
    return finish("P_parapet", bm)


def door_arch():
    bm = bmesh.new()
    # Seuil en planches, montants de pierre, linteau en bois cerclé de métal, bannière.
    for i, dx in enumerate((-0.3, 0.0, 0.3)):
        add_box(bm, (0.28, 0.94, 0.06), (dx, 0, -0.03), PLANK[i % 3], bevel=0.012)
    for sx in (-1, 1):
        add_box(bm, (0.2, 0.3, 0.86), (sx * 0.42, 0, 0.43), WALL_STONE, bevel=0.04, top_color=WALL_CAP, jitter=0.01)
    add_box(bm, (1.08, 0.3, 0.16), (0, 0, 0.92), WOOD, bevel=0.035)
    for sx in (-1, 1):
        add_box(bm, (0.06, 0.32, 0.18), (sx * 0.28, 0, 0.92), METAL, bevel=0.01)
    add_box(bm, (0.42, 0.03, 0.3), (0, 0.17, 0.72), BANNER, bevel=0.005)
    return finish("P_door", bm)


def chest():
    bm = bmesh.new()
    add_box(bm, (0.56, 0.4, 0.26), (0, 0, 0.13), WOOD, bevel=0.03)
    add_box(bm, (0.6, 0.44, 0.13), (0, 0, 0.32), WOOD, bevel=0.05, segments=2)
    return finish("P_chest", bm)


def chest_trim():
    bm = bmesh.new()
    # Garnitures blanches, teintes par la rareté à l'exécution (et légèrement émissives).
    for sx in (-1, 1):
        add_box(bm, (0.07, 0.47, 0.43), (sx * 0.18, 0, 0.2), WHITE, bevel=0.012)
    add_box(bm, (0.12, 0.05, 0.12), (0, -0.23, 0.25), WHITE, bevel=0.012)
    return finish("P_chest_trim", bm, ao=False)


def pedestal():
    bm = bmesh.new()
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=8, radius1=0.48, radius2=0.44, depth=0.14)
    bmesh.ops.translate(tmp, vec=Vector((0, 0, 0.07)), verts=tmp.verts)
    _merge(bm, tmp, WALL_STONE, WALL_CAP)
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=8, radius1=0.38, radius2=0.36, depth=0.08)
    bmesh.ops.translate(tmp, vec=Vector((0, 0, 0.18)), verts=tmp.verts)
    _merge(bm, tmp, WALL_STONE, WALL_CAP)
    return finish("P_pedestal", bm)


def torch():
    bm = bmesh.new()
    add_box(bm, (0.08, 0.08, 0.5), (0, 0, 0.25), BEAM, bevel=0.015)
    add_box(bm, (0.17, 0.17, 0.09), (0, 0, 0.52), METAL, bevel=0.02)
    return finish("P_torch", bm)


def flame():
    bm = bmesh.new()
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=1, radius=0.1)
    for v in tmp.verts:
        v.co.z = v.co.z * 1.9 if v.co.z > 0 else v.co.z * 0.8
    _merge(bm, tmp, WHITE)
    return finish("P_flame", bm, ao=False)


def grass():
    bm = bmesh.new()
    for k in range(5):
        angle = random.uniform(0, math.pi)
        base = (random.uniform(-0.09, 0.09), random.uniform(-0.09, 0.09))
        add_blade(bm, base, random.uniform(0.16, 0.28), random.uniform(0.05, 0.07), random.uniform(0.02, 0.06), angle)
    return finish("P_grass", bm, gradient=(GRASS_BASE, GRASS_TIP, 0.26), ao=False)


def crystal():
    bm = bmesh.new()
    # Grappe de prismes pointus, blancs : teintés par le langage à l'exécution.
    add_prism(bm, 0.08, 0.28, (0, 0, 0), WHITE, tip=0.1)
    add_prism(bm, 0.055, 0.18, (0.09, 0.03, 0), WHITE, tip=0.07, tilt=(0.0, 0.45))
    add_prism(bm, 0.05, 0.15, (-0.07, -0.06, 0), WHITE, tip=0.06, tilt=(-0.4, -0.25))
    return finish("P_crystal", bm, gradient=("#9a9a9a", WHITE, 0.36), ao=False)


def rock():
    bm = bmesh.new()
    add_rock(bm, 0.16, (0, 0, 0.06), ROCK)
    add_rock(bm, 0.09, (0.16, 0.06, 0.03), ROCK)
    return finish("P_rock", bm)


def pillar():
    """Pilier « LGTM » de l'antichambre : colonne octogonale, bande de runes lime (interactif : on y pousse le boss)."""
    bm = bmesh.new()
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=8, radius1=0.42, radius2=0.4, depth=0.14)
    bmesh.ops.translate(tmp, vec=Vector((0, 0, 0.07)), verts=tmp.verts)
    _merge(bm, tmp, WALL_STONE, WALL_CAP)
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=8, radius1=0.3, radius2=0.27, depth=0.95)
    bmesh.ops.translate(tmp, vec=Vector((0, 0, 0.14 + 0.475)), verts=tmp.verts)
    _merge(bm, tmp, WALL_STONE, WALL_CAP)
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=False, segments=8, radius1=0.31, radius2=0.3, depth=0.12)
    bmesh.ops.translate(tmp, vec=Vector((0, 0, 0.62)), verts=tmp.verts)
    _merge(bm, tmp, "#C3FB03")
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=8, radius1=0.38, radius2=0.42, depth=0.12)
    bmesh.ops.translate(tmp, vec=Vector((0, 0, 1.15)), verts=tmp.verts)
    _merge(bm, tmp, WALL_STONE, WALL_CAP)
    return finish("P_pillar", bm)


def fountain():
    """Fontaine (commit « fix ») : vasque octogonale ; l'eau est une pièce à part (P_water), teintée et émissive."""
    bm = bmesh.new()
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=8, radius1=0.42, radius2=0.46, depth=0.24)
    bmesh.ops.translate(tmp, vec=Vector((0, 0, 0.12)), verts=tmp.verts)
    _merge(bm, tmp, WALL_STONE, WALL_CAP)
    add_box(bm, (0.14, 0.14, 0.42), (0, 0, 0.42), WALL_STONE, bevel=0.03, top_color=WALL_CAP)
    for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        add_box(bm, (0.08, 0.08, 0.05), (sx * 0.1, sy * 0.1, 0.6), METAL, bevel=0.01)
    return finish("P_fountain", bm)


def water():
    bm = bmesh.new()
    tmp = bmesh.new()
    bmesh.ops.create_cone(tmp, cap_ends=True, segments=8, radius1=0.36, radius2=0.36, depth=0.04)
    bmesh.ops.translate(tmp, vec=Vector((0, 0, 0.22)), verts=tmp.verts)
    _merge(bm, tmp, WHITE)
    return finish("P_water", bm, ao=False)


def portal():
    """Portail (commit « revert ») : anneau de pierre dressé ; le cœur (P_portal_core) tourne et luit."""
    bm = bmesh.new()
    segments = 12
    for i in range(segments):
        a = 2 * math.pi * i / segments
        x, z = math.cos(a) * 0.42, math.sin(a) * 0.42 + 0.55
        add_box(bm, (0.2, 0.22, 0.2), (x, 0, z), WALL_STONE, bevel=0.03, top_color=WALL_CAP, rot_z=0)
    add_box(bm, (0.8, 0.34, 0.1), (0, 0, 0.05), WALL_STONE, bevel=0.03, top_color=WALL_CAP)
    return finish("P_portal", bm)


def portal_core():
    bm = bmesh.new()
    tmp = bmesh.new()
    bmesh.ops.create_circle(tmp, cap_ends=True, segments=16, radius=0.34)
    bmesh.ops.rotate(tmp, verts=tmp.verts, cent=Vector((0, 0, 0)), matrix=_rot((math.pi / 2, 0)))
    bmesh.ops.translate(tmp, vec=Vector((0, 0, 0.55)), verts=tmp.verts)
    _merge(bm, tmp, WHITE)
    return finish("P_portal_core", bm, ao=False)


def cracked_wall():
    """Mur fissuré d'une salle secrète : un rebord plus haut, pierres disjointes, fente sombre."""
    bm = bmesh.new()
    add_box(bm, (0.44, 0.9, 0.5), (-0.26, 0, 0.25), WALL_STONE, bevel=0.04, top_color=WALL_CAP, jitter=0.03)
    add_box(bm, (0.44, 0.9, 0.42), (0.26, 0.02, 0.21), WALL_STONE, bevel=0.04, top_color=WALL_CAP, jitter=0.03)
    add_box(bm, (0.06, 0.92, 0.36), (0.0, 0, 0.18), "#1B1426", bevel=0.01)
    add_rock(bm, 0.07, (0.3, -0.48, 0.03), ROCK)
    return finish("P_crack", bm)


def export(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_materials="NONE",
        export_animations=False,
        export_skins=False,
        export_morph=False,
    )
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props})


def main():
    path = out_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    clear_scene()
    objects = [
        floor_tile(), bridge(), parapet(), door_arch(), chest(), chest_trim(),
        pedestal(), torch(), flame(), grass(), crystal(), rock(), pillar(),
        fountain(), water(), portal(), portal_core(), cracked_wall(),
    ]
    for o in objects:
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        print(f"{o.name}: {tris} triangles")
    export(path, objects)
    print("exporté :", path)


if __name__ == "__main__":
    main()
