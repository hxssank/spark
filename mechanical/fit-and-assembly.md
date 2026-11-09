# Spark fit prototype A

The model is 116 × 24 × 14.8 mm. It packages a nominal 66 × 18 × 7.7 mm cell and a separate 20 × 38 × 1 mm PCB. The graphite render shows an aluminium finish study. The first physical assembly uses printed insulating parts.

The CAD does not establish 25 W electrical performance or case temperature. All 25 board references now use the generated PCB placement coordinates. U1, the 6 mm inductor and the 2.7 mm rear capacitors use manufacturer maximum bodies with 0.1 mm solder allowance. The remaining unselected component bodies use 1.0 mm installed-height allowances; these are not verified part dimensions. The board still lacks the complete power bank circuit. The generic USB-C and A30 solids reserve unverified connector space. The 3.5 mm lead bay needs checking against an actual cell, lead bend and connector. The cell pocket gives 0.6 mm on each side of the nominal cell. That clearance is a design allowance, not a manufacturer-approved swelling allowance.

The seven 1210 capacitor references use maximum body dimensions of 3.5 × 2.7 × 2.7 mm. Their 2.8 mm installed height includes 0.1 mm for solder. [Murata specifies](https://www.murata.com/en-global/api/pdfdownloadapi?cate=luCeramicCapacitorsSMD&partno=GRM32ER71E226KE15%23) a 3.2 ± 0.3 mm length and 2.5 ± 0.2 mm width and height. Placement and solder-process tolerances still need an assembly drawing.

The [Coilcraft XAL1060 drawing](https://www.coilcraft.com/getmedia/8909f858-b441-4d60-acff-8b8ca36f9ede/xal1060.pdf) gives a maximum 11.8 × 10.5 mm body, including its ±0.5 mm plan tolerances. The model now includes those tolerances.

## Display and space use

The provisional [RB060-6464TDDBG01 colour OLED](https://www.ronboe.com/shop/rb060-6464tddbg01/) occupies the rear electronics bay at z=90.5..108 mm. Its 15 × 17.5 × 1.2 mm glass contains a 10.73 mm square active area with 64 × 64 pixels. The active area is centred for this visual study; its exact placement and 20-pin FPC drawing remain unverified. The screen, 0.4 mm carrier support plate and flush 0.5 mm lens use previously empty volume behind the board. The case stays 116 × 24 × 14.8 mm.

The glass clears the maximum rear capacitor bodies by 0.25 mm along the case length. It clears the provisional low-component height allowances by 0.75 mm. A 12 × 1.5 × 5 mm keepout reserves a possible FPC route toward the USB end. It is not a supplier cable model. The controller, connector, supply circuit, heat isolation, edge adhesive and lens bond still need design and physical verification. This is a fit reservation, not a working battery-health display.

The 116 mm length contains 6.5 mm for the base and screw clearance, 66 mm for the cell, a 3.5 mm lead gap, a 38 mm board and 2 mm beyond the board. Shortening the case would remove one of those allowances. This revision uses the free board-side volume for the screen.

The rounded exterior encloses 40.184 cm³. The current solid parts and component reservations occupy 27.527 cm³, leaving 12.657 cm³ unallocated. That remainder includes assembly clearances and space for the missing circuits, wiring and connector details. It is not a contiguous electronics bay. The generated mechanical contract records this volume budget and the five length allocations so the preview uses the same dimensions as the CAD.

An accumulated OLED and PCB placement error of 0.25 mm closes the nominal OLED-to-capacitor gap. The 0.35 mm rear capacitor clearance and 0.30 mm sleeve running clearance also lack qualified manufacturing tolerances. The USB shell clears the bare J3 pad by 0.25 mm, but that check excludes the solder joint, output wire and connector feet. Select those parts and allocate their tolerances before reducing the case size or treating the full power board as fitted.

## Files

- `build_model.py` is the editable CadQuery source. It exports STEP, STL, assembly STEP and GLB.
- `mechanical-contract.json` records positions, clearances, PCB edge-seat keepouts and screw dimensions.
- `exports/build-report.json` binds the CAD generator, component placement and dependency file to the generated contract, models and print meshes using SHA256 hashes.
- `exports/spark_assembly.step` contains coloured parts and reference envelopes.
- `print_parts` contains only the four printed parts, oriented and placed on the build plane. `exports` retains their assembled coordinates.
- Files ending in `_reference` are visual envelopes. Do not print them for a powered assembly.
- `renders` contains assembled, exploded and open-carrier views plus editable Blender scenes.

## Dry assembly

1. Print a dry fit set. Use a 0.4 mm nozzle, 0.16 mm layers and three perimeter lines as starting settings. Print the sleeve and carrier upright with a brim. Lay the front cover flat. Orient the bottom cap with its outer counterbored face upward. Inspect thin walls and holes before assembly.
2. Use an inert 66 × 18 × 7.7 mm gauge for the first fit. Check that the sleeve slides over the carrier without squeezing the cell pocket. Sand the carrier only; do not reduce cell clearance to force the assembly together.
3. Place the cell in the open carrier from its front. Place the front insulating cover over it. The sleeve retains that cover. No screws, magnets or fasteners enter the cell pocket.
4. Seat the PCB on the four edge ledges. The two rear edge regions from z=78..81 and z=99..102 need component keepouts where |x|≥9.5 mm. Recheck these against the actual board. The generic USB-C opening is 10.4 × 4.6 mm with a 0.5 mm recess. Its centre is y=1.2 mm, which leaves 0.25 mm between its shell and the J3 pad envelope. The exact connector feet still need verification. A conservative 6 × 6 × 12 mm A30 reference sits in the front of the board bay at z=75.1..87.1; verify its dimensions, terminals and wire bend with the actual connector.
5. Slide the sleeve onto the carrier from its lower end. Attach the bottom cap using two M2 × 3 mm socket-head screws with head diameter at most 4.0 mm and head height at most 2.0 mm. The 1.6 mm pilot holes form prototype plastic threads. Their pullout strength and reuse life are untested. Do not substitute longer screws; nominal screw tips stop 1.3 mm below the cell.
6. For the screen fit study, insert an inert 15 × 17.5 × 1.2 mm gauge through the rear opening onto the carrier support. The panel stays on the carrier and the lens stays on the sleeve. The checked sleeve-removal path does not require unplugging the display; the final FPC routing must preserve that path. Remove the lens to extract the panel through the rear opening. Qualify the proposed edge adhesive and 0.1 mm lens bond before using a powered screen.

The sleeve-to-carrier clearance is 0.3 mm per side. The inductor has 0.8 mm to the sleeve. The maximum rear capacitor envelope has 0.35 mm to the carrier backplate. Printer shrinkage can consume it. The fit needs one print-and-measure cycle before buying a machined enclosure.

## Before a powered enclosure

Measure the actual cell including tabs, pouch seams, lead exit and connector. Fit the routed PCB and the purchased USB-C socket. Verify electrical isolation, cell retention without compression, strain relief and screw clearance. Run power and thermal tests on an open bench before enclosing the battery.

A machined aluminium version needs a revised insulating liner, controlled electrical clearances, a defined thermal path away from the pouch, port-load support and metal-compatible fastening. The printed sleeve STEP is not a machining release for a battery product.

For the first setup in a fresh workspace:

```sh
uv venv --python 3.12 .tooling/mechanical/venv
uv pip install --python .tooling/mechanical/venv/bin/python -r mechanical/requirements.txt
```

To regenerate:

```sh
.tooling/mechanical/venv/bin/python mechanical/build_model.py
.tooling/mechanical/venv/bin/pytest -q mechanical/test_model.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python mechanical/render_model.py
```

CadQuery 2.8.0 provides solid modelling and STEP export. Blender provides the render only. Both geometry files and source remain editable. This revision has fixed dimensions; passing changed values to `Dimensions` raises an error because the mounting and opening geometry is not fully parametric. Change the geometry and fit checks together when revising the enclosure.

The exporter checks every part for a single valid solid, checks every pair for overlap and rejects parts outside the enclosure. A swept shell checks the entire downward sleeve-removal path against all retained parts, including component reservations. The panel and lens removal tests do not validate an actual flex cable. The exporter stages the output files before replacing them, validates each print mesh for closed edges, consistent winding, positive volume and build-plane placement, and writes its hash report last. Interrupted exports leave the earlier files intact; interrupted publication fails the package freshness check. These checks cannot establish printer accuracy, cell swelling allowance or retention strength.
