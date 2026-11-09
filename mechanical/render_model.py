from __future__ import annotations

import json
import math
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
GRAPHITE = (0.07, 0.08, 0.095)


def material(name: str, color: tuple[float, float, float], metal: float = 0.0,
             roughness: float = 0.4) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color, 1.0)
    node.inputs["Metallic"].default_value = metal
    node.inputs["Roughness"].default_value = roughness
    return mat


def point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup() -> dict[str, bpy.types.Material]:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1400
    scene.render.resolution_percentage = 100
    scene.world.color = (0.32, 0.32, 0.32)
    scene.view_settings.view_transform = "AgX"
    mats = {
        "sleeve": material("Satin graphite finish study", GRAPHITE, 0.72, 0.32),
        "carrier": material("Insulating carrier", (0.075, 0.085, 0.1), 0.0, 0.42),
        "front_cover": material("Insulating cover", (0.12, 0.13, 0.15), 0.0, 0.4),
        "bottom_cap": material("Matched graphite cap finish study", GRAPHITE, 0.72, 0.32),
        "battery_reference": material("Cell envelope", (0.5, 0.52, 0.55), 0.4, 0.35),
        "pcb_reference": material("PCB envelope", (0.025, 0.18, 0.11), 0.2, 0.45),
        "usb_reference": material("Port shell", (0.7, 0.72, 0.76), 0.9, 0.25),
        "usb_tongue_reference": material("Port tongue", (0.03, 0.035, 0.04), 0.0, 0.6),
        "display_glass_reference": material("OLED glass envelope", (0.025, 0.03, 0.04), 0.0, 0.18),
        "display_active_reference": material("Unpowered OLED active area", (0.015, 0.02, 0.025), 0.0, 0.16),
        "display_lens_reference": material("Protective lens reference", (0.7, 0.82, 0.9), 0.0, 0.08),
        "display_fpc_keepout_reference": material("Unverified FPC route allowance", (0.8, 0.35, 0.06), 0.0, 0.45),
    }
    lens = mats["display_lens_reference"].node_tree.nodes.get("Principled BSDF")
    lens.inputs["Alpha"].default_value = 0.12
    lens.inputs["Transmission Weight"].default_value = 0.8
    mats["display_fpc_keepout_reference"].node_tree.nodes.get("Principled BSDF").inputs["Alpha"].default_value = 0.25
    bpy.ops.mesh.primitive_plane_add(size=2000, location=(0, 0, -0.1))
    bpy.context.object.data.materials.append(material("Studio floor", (0.72, 0.71, 0.68), 0.0, 0.85))
    for name, loc, energy, width, height in (
        ("Front softbox", (-90, -140, 165), 650000, 90, 180),
        ("Edge strip", (110, 50, 150), 750000, 35, 180),
        ("Front fill", (100, -180, 70), 260000, 110, 150),
    ):
        bpy.ops.object.light_add(type="AREA", location=loc)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "RECTANGLE"
        light.data.size = width
        light.data.size_y = height
        point_at(light, (0, 0, 60))
    bpy.ops.object.camera_add(location=(155, 240, 172))
    camera = bpy.context.object
    point_at(camera, (0, 0, 59))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 165
    scene.camera = camera
    mats["inductor_reference"] = material("Inductor body", (0.07, 0.07, 0.075), 0.1, 0.5)
    mats["input_cap_reference"] = material("Ceramic capacitor", (0.28, 0.17, 0.09), 0.0, 0.5)
    mats["a30_unmeasured_reference"] = material("A30 unmeasured envelope", (0.85, 0.31, 0.09), 0.0, 0.4)
    for index in range(5, 11):
        mats[f"c{index}_reference"] = mats["input_cap_reference"]
    for name in json.loads((ROOT / "exports/geometry-report.json").read_text()):
        if name not in mats:
            color = (0.7, 0.48, 0.12) if name.endswith("pad_reference") else (0.12, 0.13, 0.14)
            mats[name] = material(name, color, 0.5 if name.endswith("pad_reference") else 0.0, 0.4)
    return mats


def import_part(name: str, mat: bpy.types.Material,
                position: tuple[float, float, float] = (0, 0, 0)) -> bpy.types.Object:
    bpy.ops.wm.stl_import(filepath=str(ROOT / "exports" / f"{name}.stl"))
    obj = bpy.context.object
    obj.name = name
    obj.location += Vector(position)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Edge highlight", "BEVEL")
    bevel.width = 0.06
    bevel.segments = 2
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def apply_head_finish(carrier: bpy.types.Object, finish: bpy.types.Material) -> None:
    carrier.data.materials.append(finish)
    for polygon in carrier.data.polygons:
        if all(carrier.data.vertices[index].co.z >= 114.999 for index in polygon.vertices):
            polygon.material_index = 1


def add_front_finish(finish: bpy.types.Material) -> None:
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -7.403, 99.25),
                                    rotation=(math.pi / 2, 0, 0))
    coating = bpy.context.object
    coating.name = "Colour-matched transmissive lens appearance study"
    coating.dimensions = (17.2, 19.7, 0)
    coating.data.materials.append(finish)
    coating["appearance_study"] = True
    coating["note"] = "Coating appearance only; transmission and manufacture are unverified. Display is off."
    bpy.ops.object.text_add(location=(0, -7.409, 18), rotation=(math.pi / 2, 0, 0))
    wordmark = bpy.context.object
    wordmark.name = "Subtle front wordmark finish study"
    wordmark.data.body = "S P A R K"
    wordmark.data.align_x = "CENTER"
    wordmark.data.size = 1.8
    wordmark.data.extrude = 0.001
    wordmark.data.materials.append(material("Etched wordmark appearance", (0.16, 0.18, 0.20), 0.5, 0.4))


def render_view(view: str, output: Path) -> None:
    mats = setup()
    positions = {name: (0, 0, 0) for name in mats}
    if view == "exploded":
        positions.update({"sleeve": (-40, 0, 10), "carrier": (20, 0, 10),
                          "battery_reference": (20, 17, 10), "front_cover": (20, 30, 10),
                          "pcb_reference": (20, 9, 10), "usb_reference": (20, 9, 10),
                          "usb_tongue_reference": (20, 9, 10), "bottom_cap": (20, 0, 0)})
        for name in mats:
            if name not in ("sleeve", "carrier", "front_cover", "bottom_cap", "battery_reference"):
                positions[name] = (20, -17, 10) if name.startswith("display_") else (20, 9, 10)
        positions["display_lens_reference"] = (20, -29, 10)
        positions["a30_unmeasured_reference"] = (20, 17, 10)
        bpy.context.scene.camera.location = (175, 270, 190)
        point_at(bpy.context.scene.camera, (0, 8, 64))
        bpy.context.scene.camera.data.ortho_scale = 195
    objects = {}
    for name, mat in mats.items():
        if view == "cutaway" and name in ("sleeve", "front_cover"):
            continue
        objects[name] = import_part(name, mat, positions[name])
    apply_head_finish(objects["carrier"], mats["sleeve"])
    if view == "assembled":
        bpy.context.scene.camera.location = (105, -285, 157)
        point_at(bpy.context.scene.camera, (0, 0, 59))
        bpy.context.scene.camera.data.ortho_scale = 163
        add_front_finish(mats["sleeve"])
    bpy.context.scene.render.filepath = str(output / f"spark_{view}.png")
    bpy.ops.render.render(write_still=True)
    bpy.context.scene.render.filepath = f"//spark_{view}.png"
    bpy.ops.wm.save_as_mainfile(filepath=str(output / f"spark_{view}.blend"))


def main() -> None:
    sys.path.insert(0, str(ROOT))
    from render_assets import VIEWS, publish_renders, render_inputs

    requested = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    views = list(dict.fromkeys(requested or VIEWS))
    if any(view not in VIEWS for view in views):
        raise ValueError(f"Unknown render view in {views!r}")
    inputs = render_inputs(ROOT)
    with tempfile.TemporaryDirectory(prefix=".spark-render-", dir=ROOT) as temporary:
        stage = Path(temporary)
        for view in views:
            render_view(view, stage)
        publish_renders(ROOT, stage, views, inputs, bpy.app.version_string)


if __name__ == "__main__":
    main()
