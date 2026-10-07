"""Aperçu du kit : construit les prototypes puis rend une planche isométrique.

    blender -b --factory-startup -P scripts/blender/dungeon-kit/preview.py -- <glb> <png> [build.py|characters.py]

Rendu Workbench en couleurs de sommet, pour juger formes et ombrage figé sans la
teinte du site (appliquée à l'exécution).
"""
import math
import os
import runpy
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
png = os.path.abspath(argv[1]) if len(argv) > 1 else os.path.join(HERE, "preview.png")
source = argv[2] if len(argv) > 2 else "build.py"

runpy.run_path(os.path.join(HERE, source), run_name="__main__")

# Planche : un prototype (ou un personnage et ses parties) par case, 4 colonnes, espacées de 1.6 case.
COLS, GAP = 4, 1.6
groups = {}
for o in sorted(bpy.data.objects, key=lambda o: o.name):
    if o.name.startswith("P_"):
        groups[o.name] = [o]
    elif o.name.startswith("C_"):
        groups.setdefault(o.name.split("_")[1], []).append(o)
protos = list(groups)
for i, key in enumerate(protos):
    for o in groups[key]:
        # La tête du héros a son pivot au cou.
        o.location = Vector(((i % COLS) * GAP, -(i // COLS) * GAP, 0.34 if o.name == "C_hero_head" else 0))

scene = bpy.context.scene
cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = COLS * GAP + 0.8
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
rows = (len(protos) + COLS - 1) // COLS
center = Vector(((COLS - 1) * GAP / 2, -(rows - 1) * GAP / 2, 0.2))
# Même angle que la scène three.js : vue depuis (+x, +y, +z) de three = (+x, -y, +z) de Blender.
cam.location = center + Vector((6, -6, 6))
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

scene.render.engine = "BLENDER_WORKBENCH"
shading = scene.display.shading
shading.light = "STUDIO"
# Le nom de l'option des couleurs de sommet a changé selon les versions : on lit l'énumération.
color_types = [i.identifier for i in type(shading).bl_rna.properties["color_type"].enum_items]
shading.color_type = next(t for t in ("VERTEX", "ATTRIBUTE") if t in color_types)
print("color_type :", shading.color_type, "parmi", color_types)
shading.show_cavity = True
scene.render.resolution_x = 1200
scene.render.resolution_y = 760
scene.render.film_transparent = False
scene.world = scene.world or bpy.data.worlds.new("w")
scene.render.filepath = png
bpy.ops.render.render(write_still=True)
print("aperçu :", png)
