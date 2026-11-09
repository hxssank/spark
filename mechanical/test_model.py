from __future__ import annotations

import hashlib
import itertools
import json
import struct
from pathlib import Path

import build_model
import cadquery as cq
import pytest
from build_model import (
    Dimensions,
    box,
    build_parts,
    build_print_parts,
    contract,
    print_mesh_report,
    validate_enclosure,
    validate_parts,
    validate_sleeve_removal,
)


@pytest.fixture(scope="module")
def parts() -> dict[str, cq.Workplane]:
    return build_parts()


def test_parts_are_single_valid_solids(parts: dict[str, cq.Workplane]) -> None:
    for name, part in parts.items():
        assert part.val().isValid(), name
        assert len(part.solids().vals()) == 1, name
        assert part.val().Volume() > 0, name


def test_printed_parts_have_no_solid_intersections(parts: dict[str, cq.Workplane]) -> None:
    names = ("sleeve", "carrier", "front_cover", "bottom_cap")
    for first, second in itertools.combinations(names, 2):
        assert parts[first].intersect(parts[second]).val().Volume() < 0.001, (first, second)


def test_cell_and_board_clear_printed_parts(parts: dict[str, cq.Workplane]) -> None:
    for reference in ("battery_reference", "pcb_reference", "usb_reference", "inductor_reference", "input_cap_reference",
                      "a30_unmeasured_reference", *(f"c{i}_reference" for i in range(5, 11))):
        for name in ("sleeve", "carrier", "front_cover", "bottom_cap"):
            assert parts[reference].intersect(parts[name]).val().Volume() < 0.001, (reference, name)


def test_cell_clearance_and_lead_gap(parts: dict[str, cq.Workplane]) -> None:
    cell = parts["battery_reference"]
    board = parts["pcb_reference"].val().BoundingBox()
    assert board.zmin - cell.val().BoundingBox().zmax == pytest.approx(3.5)
    assert cell.val().distance(parts["front_cover"].val()) == pytest.approx(0.7)
    for side in (-1, 1):
        assert cell.translate((side * 0.59, 0, 0)).intersect(parts["carrier"]).val().Volume() < 0.001
        assert cell.translate((side * 0.61, 0, 0)).intersect(parts["carrier"]).val().Volume() > 0.001
    assert cell.translate((0, -0.99, 0)).intersect(parts["carrier"]).val().Volume() < 0.001
    assert cell.translate((0, -1.01, 0)).intersect(parts["carrier"]).val().Volume() > 0.001


def test_external_envelope(parts: dict[str, cq.Workplane]) -> None:
    joined = parts["sleeve"].union(parts["carrier"]).union(parts["bottom_cap"])
    bb = joined.val().BoundingBox()
    assert bb.xlen == pytest.approx(24)
    assert bb.ylen == pytest.approx(14.8)
    assert bb.zlen == pytest.approx(116)


def test_sleeve_covers_neck_up_to_one_mm_port_band(parts: dict[str, cq.Workplane]) -> None:
    sleeve = parts["sleeve"].val().BoundingBox()
    assert (sleeve.zmin, sleeve.zmax) == pytest.approx((3, 115))
    neck = parts["carrier"].intersect(box(24, 14.8, 2.9, z=112)).val().BoundingBox()
    assert (neck.xlen, neck.ylen) == pytest.approx((21, 11.8))
    port_face = box(1, 1, 0.9, x=7, y=1.2, z=115.05)
    assert port_face.cut(parts["carrier"]).val().Volume() < 0.001


def test_end_chamfers_preserve_seam_width_and_screw_seats(parts: dict[str, cq.Workplane]) -> None:
    for name, selector in (("carrier", ">Z"), ("bottom_cap", "<Z")):
        end = parts[name].faces(selector).val().BoundingBox()
        assert (end.xlen, end.ylen) == pytest.approx((23.1, 13.9))
    cap_seam = parts["bottom_cap"].faces(">Z").val().BoundingBox()
    assert (cap_seam.xlen, cap_seam.ylen) == pytest.approx((24, 14.8))
    for xpos in (-6, 6):
        screw_seat = box(0.1, 0.1, 0.7, x=xpos + 1.6, z=2.25)
        assert screw_seat.cut(parts["bottom_cap"]).val().Volume() < 0.001


def test_custom_dimensions_cannot_silently_misrepresent_fixed_geometry() -> None:
    with pytest.raises(ValueError, match="Dimensions are fixed for prototype A"):
        Dimensions(thickness=13.8)


@pytest.mark.parametrize("value", [True, float("nan"), float("inf"), "1.0"])
def test_dimensions_reject_nonfinite_or_nonnumeric_values(value: object) -> None:
    with pytest.raises(ValueError, match="finite numbers"):
        Dimensions(pcb_thickness=value)


@pytest.mark.parametrize("value", [True, float("nan"), float("inf"), "1.0"])
def test_shapes_reject_invalid_coordinates_before_calling_cad(value: object) -> None:
    for create in (lambda: box(1, 1, 1, x=value),
                   lambda: build_model.cylinder(1, 1, z=value),
                   lambda: build_model.rounded_prism(4, 4, 1, value)):
        with pytest.raises(ValueError, match="finite number"):
            create()


def test_screw_tips_stop_below_cell() -> None:
    d = Dimensions()
    under_head_z = 2.2
    screw_length = 3.0
    assert d.cell_z - under_head_z - screw_length >= 1.2


def test_input_cap_clears_reserved_usb(parts: dict[str, cq.Workplane]) -> None:
    assert parts["input_cap_reference"].intersect(parts["usb_reference"]).val().Volume() < 0.001


def test_component_stack_gaps(parts: dict[str, cq.Workplane]) -> None:
    assert parts["inductor_reference"].val().distance(parts["sleeve"].val()) == pytest.approx(0.8)
    for index in range(5, 11):
        assert parts[f"c{index}_reference"].val().distance(parts["carrier"].val()) == pytest.approx(0.35)


def test_capacitor_envelopes_include_body_tolerances(parts: dict[str, cq.Workplane]) -> None:
    for name in ("input_cap_reference", *(f"c{i}_reference" for i in range(5, 11))):
        bounds = parts[name].val().BoundingBox()
        assert (bounds.xlen, bounds.ylen, bounds.zlen) == pytest.approx((2.7, 2.8, 3.5))
    assert contract()["pcb"]["capacitor_1210_max_envelope"] == [2.7, 2.8, 3.5]


def test_all_parts_clear_each_other(parts: dict[str, cq.Workplane]) -> None:
    validate_parts(parts)


def test_print_parts_start_on_build_plane(parts: dict[str, cq.Workplane]) -> None:
    print_parts = build_print_parts(parts)
    assert set(print_parts) == {"sleeve", "carrier", "front_cover", "bottom_cap"}
    for part in print_parts.values():
        assert part.val().BoundingBox().zmin == pytest.approx(0)
    assert print_parts["front_cover"].val().BoundingBox().zlen == pytest.approx(0.8)


def test_export_rejects_collisions_before_replacing_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    existing_export = tmp_path / "battery_reference.step"
    existing_export.write_text("previous verified export")
    colliding = {"battery_reference": box(18, 7.7, 66), "carrier": box(21, 11.8, 3)}
    monkeypatch.setattr(build_model, "build_parts", lambda: colliding)
    with pytest.raises(ValueError, match="battery_reference intersects carrier"):
        build_model.export_all(tmp_path)
    assert existing_export.read_text() == "previous verified export"
    assert list(tmp_path.iterdir()) == [existing_export]


def test_display_preserves_case_size_and_component_clearance(parts: dict[str, cq.Workplane]) -> None:
    display = parts["display_glass_reference"].val()
    bounds = display.BoundingBox()
    assert (bounds.xlen, bounds.ylen, bounds.zlen) == pytest.approx((15, 1.2, 17.5))
    assert display.distance(parts["c9_reference"].val()) == pytest.approx(0.25)
    for name in ("r4_unmeasured_reference", "c11_unmeasured_reference", "c12_unmeasured_reference"):
        assert display.distance(parts[name].val()) >= 0.749
    lens = parts["display_lens_reference"].val().BoundingBox()
    assert lens.ymin == pytest.approx(-Dimensions().thickness / 2)
    assert lens.zmax < Dimensions().length


def test_display_can_be_removed_through_rear_opening(parts: dict[str, cq.Workplane]) -> None:
    extraction = box(15, 5.2, 17.5, y=-6.05, z=90.5)
    for name in ("sleeve", "carrier"):
        assert extraction.intersect(parts[name]).val().Volume() < 0.001, name


def test_sleeve_slides_off_with_display_retained(parts: dict[str, cq.Workplane]) -> None:
    validate_sleeve_removal(parts)


def test_sleeve_removal_rejects_part_in_display_opening(parts: dict[str, cq.Workplane]) -> None:
    obstructed = {**parts, "display_connector": box(1, 0.2, 0.2, y=-6.4, z=97)}
    assert obstructed["display_connector"].intersect(parts["sleeve"]).val().Volume() < 0.001
    with pytest.raises(ValueError, match="Sleeve removal path intersects display_connector"):
        validate_sleeve_removal(obstructed)


def test_sleeve_removal_checks_extended_port_end(parts: dict[str, cq.Workplane]) -> None:
    obstructed = {**parts, "port_clip": box(0.2, 0.2, 0.2, x=10.9, z=114)}
    with pytest.raises(ValueError, match="Sleeve removal path intersects port_clip"):
        validate_sleeve_removal(obstructed)


def test_enclosure_contains_all_references(parts: dict[str, cq.Workplane]) -> None:
    validate_enclosure(parts)
    with pytest.raises(ValueError, match="oversize_connector extends outside"):
        validate_enclosure({**parts, "oversize_connector": box(1, 1, 1, x=13, z=100)})


def test_space_budget_preserves_clearances(parts: dict[str, cq.Workplane]) -> None:
    report = contract(parts=parts)
    budget = report["space_budget"]
    assert budget["modeled_occupancy_mm3"] + budget["unallocated_volume_mm3"] == pytest.approx(
        budget["rounded_case_volume_mm3"], abs=0.001
    )
    bays = budget["longitudinal_bays"]
    assert sum(bay["length_mm"] for bay in bays) == pytest.approx(116)
    assert all(first["end_z_mm"] == second["start_z_mm"] for first, second in itertools.pairwise(bays))
    clearances = {entry["key"]: entry["nominal_mm"] for entry in report["clearances"]}
    assert clearances == pytest.approx({"sleeve_carrier": 0.3, "cell_side": 0.6, "cell_front": 0.7,
                                      "cell_back": 1.0, "inductor_sleeve": 0.8, "rear_cap_carrier": 0.35,
                                      "display_cap": 0.25, "usb_output_pad": 0.25})


@pytest.mark.parametrize(("field", "value", "error"), [
    ("side", "underside", "invalid PCB side"),
    ("maximum_body_height_mm", -1, "invalid component height"),
    ("body_bounds_board_xy_mm", [8, 10, 7, 12], "invalid component bounds"),
    ("reference", "L1", "Duplicate or invalid PCB reference"),
    ("reference", "l1", "Duplicate or invalid PCB reference"),
    ("reference", "../R1", "Duplicate or invalid PCB reference"),
    ("maximum_body_height_mm", True, "invalid component height"),
    ("body_bounds_board_xy_mm", [True, 10, 7, 12], "invalid component bounds"),
])
def test_component_export_rejects_bad_placement(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, field: str, value: object, error: str
) -> None:
    placement = json.loads(build_model.PLACEMENT_FILE.read_text())
    placement["components"][0][field] = value
    source = tmp_path / "placement.json"
    source.write_text(json.dumps(placement))
    monkeypatch.setattr(build_model, "PLACEMENT_FILE", source)
    with pytest.raises(ValueError, match=error):
        build_model.component_references(Dimensions())


def test_contract_uses_placed_geometry_for_component_bounds_and_cell_gaps(
    parts: dict[str, cq.Workplane]
) -> None:
    shifted = dict(parts)
    shifted["inductor_reference"] = parts["inductor_reference"].translate((0, -0.1, 0))
    for index in range(5, 11):
        name = f"c{index}_reference"
        shifted[name] = parts[name].translate((0, 0.1, 0))
    shifted["battery_reference"] = parts["battery_reference"].translate((0.1, 0.1, 0))
    report = contract(parts=shifted)
    assert report["pcb"]["top_component_max_y"] == pytest.approx(5.3)
    assert report["pcb"]["bottom_component_min_y"] == pytest.approx(-4.4)
    assert report["cell"]["origin"] == pytest.approx([-8.9, -3.75, 6.5])
    assert report["cell"]["minimum_radial_clearance_each_side"] == pytest.approx(0.5)
    assert report["cell"]["front_clearance"] == pytest.approx(0.6)
    assert report["cell"]["back_clearance"] == pytest.approx(1.1)


def test_contract_dimensions_do_not_change_after_tessellation(
    tmp_path: Path, parts: dict[str, cq.Workplane]
) -> None:
    before = contract(parts=parts)
    cq.exporters.export(parts["battery_reference"], str(tmp_path / "cell.stl"),
                        tolerance=0.035, angularTolerance=0.12)
    after = contract(parts=parts)
    assert after == before
    assert after["cell"]["envelope"] == [18, 7.7, 66]


def test_failed_cad_export_preserves_previous_outputs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, parts: dict[str, cq.Workplane]
) -> None:
    output = tmp_path / "exports"
    output.mkdir()
    previous = output / "u1_reference.step"
    previous.write_text("previous verified export")
    monkeypatch.setattr(build_model, "build_parts", lambda: parts)

    def fail_export(*args: object, **kwargs: object) -> None:
        Path(args[1]).write_text("partial export")
        raise RuntimeError("export interrupted")

    monkeypatch.setattr(cq.exporters, "export", fail_export)
    with pytest.raises(RuntimeError, match="export interrupted"):
        build_model.export_all(output)
    assert previous.read_text() == "previous verified export"
    assert sorted(tmp_path.iterdir()) == [output]
    assert sorted(output.iterdir()) == [previous]


@pytest.mark.parametrize("defect", [None, "missing_face", "reversed_face", "below_bed"])
def test_print_mesh_validation(tmp_path: Path, defect: str | None) -> None:
    vertices = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)]
    triangles = [(0, 2, 1), (0, 1, 3), (0, 3, 2), (1, 2, 3)]
    if defect == "missing_face":
        triangles.pop()
    elif defect == "reversed_face":
        triangles[0] = tuple(reversed(triangles[0]))
    elif defect == "below_bed":
        vertices = [(x, y, z - 1) for x, y, z in vertices]
    data = bytearray(80) + struct.pack("<I", len(triangles))
    for triangle in triangles:
        coordinates = [coordinate for index in triangle for coordinate in vertices[index]]
        data.extend(struct.pack("<12fH", 0, 0, 0, *coordinates, 0))
    path = tmp_path / "part.stl"
    path.write_bytes(data)
    if defect is not None:
        with pytest.raises(ValueError, match="watertight, consistently wound"):
            print_mesh_report(path)
    else:
        report = print_mesh_report(path)
        assert report["watertight"] and report["winding_consistent"]
        assert report["volume_mm3"] == pytest.approx(0.167)


def test_usb_shell_clears_positive_output_pad(parts: dict[str, cq.Workplane]) -> None:
    assert parts["usb_reference"].val().distance(parts["j3_pad_reference"].val()) >= 0.249


def test_component_placements_include_all_board_references(parts: dict[str, cq.Workplane]) -> None:
    references = build_model.component_references(Dimensions())
    assert len(references) == 25
    assert set(references) <= set(parts)
    inductor = parts["inductor_reference"].val().BoundingBox()
    assert (inductor.xlen, inductor.ylen, inductor.zlen) == pytest.approx((11.8, 6.1, 10.5))
    controller = parts["u1_reference"].val().BoundingBox()
    assert (controller.xlen, controller.ylen, controller.zlen) == pytest.approx((3.1, 1.1, 2.6))


@pytest.mark.parametrize("defect", ["disconnected", "zero_area"])
def test_print_mesh_rejects_closed_extra_shells(tmp_path: Path, defect: str) -> None:
    vertices = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)]
    triangles = [(0, 2, 1), (0, 1, 3), (0, 3, 2), (1, 2, 3)]
    if defect == "disconnected":
        vertices += [(x + 3, y, z) for x, y, z in vertices]
        triangles += [tuple(index + 4 for index in triangle) for triangle in triangles]
        error = "disconnected mesh shells"
    else:
        vertices += [(2, 0, 0), (3, 0, 0), (4, 0, 0)]
        triangles += [(4, 5, 6), (6, 5, 4)]
        error = "zero-area triangle"
    data = bytearray(80) + struct.pack("<I", len(triangles))
    for triangle in triangles:
        coordinates = [coordinate for index in triangle for coordinate in vertices[index]]
        data.extend(struct.pack("<12fH", 0, 0, 0, *coordinates, 0))
    path = tmp_path / "part.stl"
    path.write_bytes(data)
    with pytest.raises(ValueError, match=error):
        print_mesh_report(path)


@pytest.mark.parametrize("edited", [False, True])
def test_export_prunes_only_unchanged_obsolete_generated_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, edited: bool
) -> None:
    output = tmp_path / "exports"
    output.mkdir()
    obsolete = output / "old_reference.stl"
    obsolete.write_bytes(b"old mesh")
    current = output / "new_reference.stl"
    current.write_bytes(b"previous new mesh")
    manual = output / "manual.step"
    manual.write_bytes(b"user part")
    previous = {"exports/old_reference.stl": hashlib.sha256(obsolete.read_bytes()).hexdigest()}
    (output / "build-report.json").write_text(json.dumps({"output": previous}))
    if edited:
        obsolete.write_bytes(b"edited mesh")
    monkeypatch.setattr(build_model, "build_parts", dict)
    for validator in ("validate_parts", "validate_enclosure", "validate_sleeve_removal"):
        monkeypatch.setattr(build_model, validator, lambda parts: None)

    def write_exports(stage: Path, parts: dict) -> dict:
        stage.mkdir()
        (stage / current.name).write_bytes(b"new mesh")
        return {}

    monkeypatch.setattr(build_model, "_write_exports", write_exports)
    if edited:
        with pytest.raises(ValueError, match="Obsolete CAD export has local changes"):
            build_model.export_all(output)
        assert obsolete.read_bytes() == b"edited mesh"
        assert current.read_bytes() == b"previous new mesh"
    else:
        build_model.export_all(output)
        assert not obsolete.exists()
        assert current.read_bytes() == b"new mesh"
    assert manual.read_bytes() == b"user part"
