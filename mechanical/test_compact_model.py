from __future__ import annotations

from copy import deepcopy

import pytest
from build_compact_model import geometry_report, load_layout, validate_layout


def test_compact_reservations_have_no_overlap_and_fit_cases() -> None:
    report, parts = geometry_report(load_layout())
    assert [item["non_cell_length_mm"] for item in report["versions"]] == [29, 29, 33]
    assert set(parts) == {"300", "530", "850"}
    assert all(item["solid_intersections"] == 0 and item["valid_single_solids"] > 25 for item in report["versions"])


def test_shared_usb_keepout_blocks_both_faces() -> None:
    layout = load_layout()
    version = layout["versions"][0]
    occupied = deepcopy(next(item for item in version["components"] if item["reference"] == "USB"))
    occupied.update(reference="BAD", side="back", heightMm=.2)
    version["components"].append(occupied)
    with pytest.raises(ValueError, match="back overlap"):
        validate_layout(layout)


def test_capacitor_sites_need_real_pad_allowance() -> None:
    layout = load_layout()
    bank = next(item for item in layout["versions"][0]["components"] if item["reference"] == "COUT")
    bank["capacitorSites"] = 7
    with pytest.raises(ValueError, match="capacitor sites"):
        validate_layout(layout)


def test_taller_rear_part_cannot_intersect_display() -> None:
    layout = load_layout()
    component = next(item for item in layout["versions"][0]["components"] if item["reference"] == "PD")
    component["heightMm"] = 2.1
    with pytest.raises(ValueError, match="intersects the display"):
        validate_layout(layout)


def test_cell_clearance_cannot_be_traded_for_width() -> None:
    layout = load_layout()
    layout["versions"][2]["caseMm"][1] = 21
    with pytest.raises(ValueError, match="Cell clearance"):
        validate_layout(layout)


def test_total_length_tracks_every_allocated_bay() -> None:
    layout = load_layout()
    layout["versions"][0]["transitionMm"] = 1
    with pytest.raises(ValueError, match="Case length"):
        validate_layout(layout)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), True, "24"])
def test_nonfinite_or_nonnumeric_dimensions_fail(value: object) -> None:
    layout = load_layout()
    layout["versions"][0]["boardMm"][1] = value
    with pytest.raises(ValueError, match="finite numbers"):
        validate_layout(layout)
