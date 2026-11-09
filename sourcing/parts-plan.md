# Spark parts plan

The GNB8501S60WHV 850 mAh cell remains the dimensional reference while a replacement battery is being researched. The current CAD envelope is 116 × 24 × 14.8 mm with a 20 × 38 mm electronics bay. Those are design dimensions, not a confirmed fit for a complete power board.

This list was prepared on 2026-10-28 and checked against the accessible manufacturer pages on 2026-10-29. [parts-list.csv](parts-list.csv) contains quantities, requirements, AliExpress search links, sources and blank fields for actual price, shipping, tax and landed cost. The AliExpress links are search leads. No seller, listing, Canadian delivery or checkout price has been verified.

## Compact placement direction, 2026-10-30

The compact study replaces separate length reservations with parts on both faces of one board and a display over the electronics bay. Target board sizes are 17 × 24 mm for Spark 300, 20 × 24 mm for Spark 530 and 20 × 28 mm for Spark 850. These are unrouted reservations. Six copper layers are a starting point for routing; the fabricator must confirm stackup, WLP escape rules and assembly capability. The revision A PCB and implemented BOM remain unchanged.

| Version | Power components to evaluate | Reservation constraint |
|---|---|---|
| 300 and 530, 10/15 W | [BQ25638](https://www.ti.com/lit/ds/symlink/bq25638.pdf), 2.07 × 2.36 mm nominal DSBGA, plus one [XGL4030-102MEC](https://www.coilcraft.com/getmedia/032d9c73-4222-482f-b6bc-7808590e27c9/xgl4030.pdf), 4.3 × 4.3 × 3.1 mm maximum | Shared charger/boost. The 7 A continuous battery limit excludes 25 W from a 3.0 V cell. Verify peak current, inductance derating and heat at 15 W. |
| 850, 25 W | TPS61288L plus XGL7030-222MEC from the shortlist below; BQ25628 with its own inductor and capacitors if charging onboard | Main boost bypasses the charger's limited SYS path. The 8 × 8 × 3.1 mm coil dissipates a calculated 0.75 W in cold winding resistance at 9.26 A. |
| All compact versions | MAX17311, STM32G071GBU6N and TCPP03-M20, plus required external parts | MAX17311 replaces the separate gauge/protector pair. TCPP03's 4 × 4 mm body does not include VBUS FETs, shunt or bias capacitor. Retain independent cell disconnect and temperature sensing. |

For the 850 output bank, reserve eight to ten 0805 capacitor sites before choosing population. Smaller parallel capacitors save space only if they meet the existing 60 µF effective requirement at 9 V after derating. Two identical capacitors in series halve nominal capacitance. The TDK candidate's maximum body is 2.2 × 1.45 × 1.45 mm; retrieved specifications do not establish its effective capacitance at 9 V. Keep local high-frequency decoupling next to the IC. [TDK specification](https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C2012X5R1E226M125AC)

Retain reservations for cell contacts, logic regulator, conditional OLED boost with its inductor and capacitors, display flex, button, programming pads and USB shell support. The compact contact box assumes a new interface; the existing A30 plug and lead bends have not been fitted into it. Retain A30 for the sample until a replacement passes current, temperature and mechanical checks. Keep protection with a removable cartridge; main-board protection instead requires a fixed service assembly and insulated disconnected cell leads. Body-box clearance is not a land-pattern, routing or thermal check. See the compact proposal in [power-design.md](../electronics/power-design.md) for current calculations and the distinction between integrated protection and deleted protection.

## Smaller electronics shortlist, 2026-10-29

Keep TPS61288LRQQR for the provisional 25 W output target. Prioritize a thinner inductor, smaller capacitors and shared control circuitry. The candidates below assume a single lithium-ion/polymer cell. They are research selections for a new board, not substitutions approved for the routed revision A PCB. Entries N01–N15 in the CSV remain on hold; supplier stock, price and assembly quotes are unverified.

| Function | Candidate | Size or benefit | Condition before selection |
|---|---|---|---|
| Main boost | [TPS61288LRQQR](https://www.ti.com/lit/ds/symlink/tps61288.pdf), retain | 2.5 × 3.0 mm nominal QFN; 2.6 × 3.1 × 1.0 mm maximum | Already small. Its peak switch-current rating does not establish 25 W continuous operation. |
| Thin power inductor | [Coilcraft XGL7030-222MEC](https://www.coilcraft.com/getmedia/63e6e233-cff1-40b9-9e5d-f0f490094f44/xgl7030.pdf), 2.2 µH | 8.0 × 8.0 × 3.1 mm maximum body versus 11.8 × 10.5 × 6.0 mm for current XAL1060. Body area falls 48.3%, height 48.3%. | First thin-coil experiment. Higher winding loss and lower saturation current require overload and enclosed-temperature tests. |
| Lower-loss inductor alternative | [XGL6060-222MEC](https://www.coilcraft.com/getmedia/329fe97c-7311-4726-9bf3-37718f42b168/xgl6060.pdf), 2.2 µH | 6.91 × 6.71 × 6.1 mm maximum; 62.6% less body area | Saves board space, not thickness. Saturation under overload still needs review. |
| Input/output capacitors | [TDK C2012X5R1E226M125AC](https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C2012X5R1E226M125AC) or [Murata GRM21BR61E226ME44L](https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM21BR61E226ME44-01A.pdf) | 22 µF, 25 V, X5R, 0805; 2.2 × 1.45 × 1.45 mm maximum versus existing 3.5 × 2.7 × 2.7 mm | Quantity depends on effective capacitance at operating voltage. Nominal 22 µF is insufficient evidence. |
| USB-PD and display MCU | [STM32G071GBU6N](https://www.st.com/en/microcontrollers-microprocessors/stm32g071gb.html) | 4 × 4 mm UFQFPN28, 128 KB flash and 36 KB RAM. One MCU can run the display and PD policy. | Use the N pinout with both CC connections. Needs a logic supply, pin allocation, PD firmware and hardware shutdown. |
| USB-C power-path companion | [TCPP02-M18](https://www.st.com/resource/en/datasheet/tcpp02-m18.pdf) for output only; [TCPP03-M20](https://www.st.com/resource/en/datasheet/tcpp03-m20.pdf) for shared charging/output | 3.5 × 3.5 × 0.55 mm or 4 × 4 × 0.75 mm | Adds CC protection, gate drive and discharge functions. External MOSFETs and sensing remain. No complete-board area saving has been established. |
| Optional onboard charging | [BQ25628RYKR](https://www.ti.com/lit/ds/symlink/bq25628.pdf) | 2.5 × 3.0 mm WQFN; switching charger with programmable voltage and current | Start at the cell-approved charge current. Needs its own inductor/capacitors. Keep the main boost off its 6 A SYS battery path. |
| Smaller existing gauge | [MAX17260SEWL+T](https://www.analog.com/media/en/technical-documentation/data-sheets/max17260.pdf) | 1.5 × 1.5 mm WLP versus 3 × 3 mm TDFN; 75% less chip area | Retains separate protection, Kelvin shunt and cartridge identity requirements. Assembly requires 0.4 mm pitch WLP support. |
| Integrated smart-cartridge alternative | [MAX17311X+T](https://www.analog.com/media/en/technical-documentation/data-sheets/max17300-max17313.pdf) | 1.7 × 2.5 mm WLP; gauge, standalone protection control, unique ID and 1-Wire data | Replaces the separate gauge/protector route. External FETs, shunt and thermistor remain. Needs configuration verification and one cartridge data contact. |
| Separate protection alternative | [BQ2980 family](https://www.ti.com/lit/ds/symlink/bq2980.pdf) | 1.5 × 1.5 × 0.37 mm, high-side FET driver | Final fixed-threshold order code must match the new cell. This is an alternative to MAX17311 protection, not a required extra IC. |
| Battery protection FET pair | [Toshiba SSM10N954L](https://toshiba.semicon-storage.com/info/SSM10N954L_datasheet_en_20231010.pdf?did=70605&prodName=SSM10N954L) | 2.98 × 1.49 × 0.11 mm; common-drain dual N-FET | Verify compatibility with the chosen protector, hot resistance, short-circuit interruption and assembly handling. |
| USB-C socket | [GCT USB4500-03-0-A](https://gct.co/connector/usb4500) | 6.50 mm body length, 3.16 mm profile, mid-mount, 5 A collective VBUS rating | Manufacturer page verified; mechanical PDF unavailable. Width, board cutout, lands and fit with the 1 mm PCB remain unresolved. |
| OLED supply | [TPS61046YFFR](https://www.ti.com/lit/ds/symlink/tps61046.pdf) | 0.80 × 1.20 mm nominal WCSP; integrated diode and output disconnect | Conditional on the exact panel supply specification. Its fixed 12 V circuit still needs an inductor and two capacitors. |

These dimensions describe component bodies, not land patterns or complete circuits. Do not reduce the enclosure from their sum. The screen, replacement cell, thermal copper, connector supports and assembly tolerances still set the finished dimensions.

The XGL7030-222 has 8.8 mΩ maximum room-temperature DCR. At 9.26 A its calculated DC winding loss is 0.75 W, versus 0.42 W for the existing coil. Core loss and hot copper add heat. It reaches 30% inductance loss at 14.5 A, while TPS61288 lists a maximum switch-current limit of 17.1 A at its specified test condition. An overload can therefore drive the smaller coil beyond that inductance-loss point. Add a tighter fault limit or qualify the resulting saturation before accepting it. XGL6060-222 reduces calculated winding loss to 0.41 W but retains the height. [Current coil specification](https://www.coilcraft.com/getmedia/8909f858-b441-4d60-acff-8b8ca36f9ede/xal1060.pdf)

The smaller capacitor candidates reduce maximum body area by 66.2% each, but no usable current DC-bias curve was retrieved. The output bank must retain at least 60 µF at 9 V after tolerance, bias, temperature and aging for the existing compensation assumption. Six replacements would each need at least 10 µF effective capacitance. X5R also lowers the rated temperature ceiling from 125°C to 85°C. Start the size experiment with the input capacitor, then verify input ripple and output-loop stability before reducing the output bank.

For a smart cartridge, evaluate MAX17311 before committing to a separate identity device. Its 1-Wire interface needs one data contact instead of two I2C contacts. It draws 24 µA active or 18 µA in hibernate, more than MAX17260 plus BQ2980. The current two-wire A30 connection cannot carry cartridge identity. Retain A30 for the sample until a smaller complete contact assembly passes approximately 10 A, temperature, insertion and short-circuit tests. No replacement contact assembly was qualified in this search.

Keep the colour OLED reservation. No smaller colour panel with a verified electrical drawing and supply path was qualified. The Newhaven NHD-0.6-6464G reference was [discontinued in 2020 with no direct replacement](https://support.newhavendisplay.com/hc/en-us/articles/4415257079319-03-23-20-NHD-0-6-6464G); it is not a purchase fallback. Ronbo's page again timed out. TPS61046 is a supply candidate, not confirmation that Ronbo needs 12 V.

## Integrated power alternatives

If output can fall to about 15 W, [BQ25638](https://www.ti.com/lit/ds/symlink/bq25638.pdf) is worth a separate evaluation. Its 2.07 × 2.36 mm DSBGA combines charging and boost through 9.6 V, potentially replacing two power ICs and two inductors with one of each. Its maximum recommended battery-discharge current is 7 A continuous and 9 A for 50 ms. These are operating ratings, not a promise that hardware clamps current there. At 3.0 V and assumed 90% efficiency, 7 A permits only 18.9 W before design margins. It cannot support the present 25 W target across the discharge range.

[BQ25798](https://www.ti.com/lit/ds/symlink/bq25798.pdf) also fails that low-cell requirement because its maximum recommended continuous battery-discharge current is 6 A. [BQ25898](https://www.ti.com/product/BQ25898) and [MP2696A](https://www.monolithicpower.com/en/mp2696a.html) do not provide 9 V boost output. Their advertised charge or switch currents do not establish USB output capability.

The external charging dock adds the least circuitry inside Spark. For onboard charging, BQ25628 is preferable to the smaller [BQ25186 linear charger](https://www.ti.com/lit/ds/symlink/bq25186.pdf). At 5 V input, 3.0 V cell voltage and 0.8 A, the linear charger would dissipate approximately 1.6 W. A shared USB-C port still requires source/sink switching, reverse-current blocking and interlocks. Route the main boost from the independently protected pack rather than through either charger's limited-current SYS path. The charger's ship-mode BATFET then cannot disconnect the main boost. Provide separate shutdown/isolation and inhibit charging during USB source mode to prevent a self-charging loop. Set charge voltage from the new cell's ceiling including charger tolerance; a nominal setting alone is not a maximum-voltage guarantee.

## First sample order

| Item | Quantity | AliExpress search | Selection requirement |
|---|---:|---|---|
| GNB8501S60WHV | 4 cells | [GNB 850 mAh 1S 60C A30](https://www.aliexpress.com/w/wholesale-GNB-850mAh-1S-3.8V-60C-A30-GNB8501S60WHV.html) | Exact 1S LiHV model, 66 × 18 × 7.7 mm |
| GNB A30 device lead | 2 | [A30-F8080](https://www.aliexpress.com/w/wholesale-GNB-A30-F8080-female-cable-connector.html) | Female device side, adequate copper lead size, polarity checked |
| GNB charging adapter | 1 | [A30 to PH2.0](https://www.aliexpress.com/w/wholesale-GNB-A30-PH2.0-charging-adapter.html) | A30 female to PH2.0 male, used only for charging |
| Short phone cable | 1 | [USB-C 60 W, 3 A, 0.2 m](https://www.aliexpress.com/w/wholesale-USB-C-to-USB-C-60W-3A-0.2m-cable.html) | USB-C at both ends, 3 A rating, no magnetic tip |
| Insulation and wire | 1 small set each | [Fishpaper and polyimide](https://www.aliexpress.com/w/wholesale-battery-fish-paper-insulation-0.2mm-polyimide-tape.html), [20 AWG wire](https://www.aliexpress.com/w/wholesale-20AWG-silicone-copper-wire-red-black.html) | Allow for insulation in fit check; keep battery leads short |
| M2 × 3 screws | 10, two used | [Socket-head cap screws](https://www.aliexpress.com/w/wholesale-M2x3-socket-head-cap-screw.html) | Head diameter about 3.8 mm, head height at most 2 mm |

Print the sleeve, carrier, front cover and bottom cap using existing PLA or PETG for an unpowered fit check. The screws engage the carrier's blind pilot holes. This prototype does not need heat-set inserts. Battery, connector and component tolerances still need physical measurements.

The [cell manufacturer](https://www.gaoneng.shop/products/gaoneng-gnb-lihv-1s-3.8v-850mah-60c-a30-cabled-lipo-battery-long-range) specifies 850 mAh at 3.8 V, 17.5 g ± 1 g, the dimensions above, an A30 connector, a 60C discharge label and 1C to 5C charging. The 60C label does not establish sustained performance in a closed case. The page does not provide a discharge-temperature curve, long-term charged-storage qualification, a protection-circuit specification or a drawing establishing lead and connector clearance.

At 25 W output, a 3.0 V cell would supply 9.26 A if conversion efficiency were 90%. This is a calculation, not a tested rating. The [A30 product page](https://www.gaoneng.shop/products/gaoneng-a30-connector-adapter-for-fpv-whoops-quads-lipo-battery) identifies the mating leads and charging adapter but does not establish a current rating for the complete installed lead assembly. Check voltage drop and temperature at the joint. Keep the PH2.0 charging adapter out of the discharge circuit.

## Battery display candidate

Reserve the [Ronbo RB060-6464TDDBG01 colour OLED](https://www.ronboe.com/shop/rb060-6464tddbg01/) for the next fit sample. Its listed glass body is 15 × 17.5 × 1.2 mm, with a 10.73 × 10.73 mm active area and 64 × 64 RGB pixels. It uses SPI and a 20-pin, 0.5 mm pitch flex connection. This is a colour OLED candidate; the listing does not establish AMOLED technology or qualify display lifetime.

The supplier page timed out during the 2026-10-29 audit, so the listed panel details have not been revalidated. The panel goes in the space behind the upper board. It needs a protective lens, a removable mount, a flex route and driver electronics. The nominal glass dimensions do not include a verified folded-flex or connector envelope. Obtain the exact drawing, maximum dimensions, electrical specification and a sample before committing the opening or ordering a batch. Stock, product lifecycle and Canadian landed cost remain unverified. The older Newhaven NHD-0.6-6464G documentation is a circuit reference, not proof that the Ronbo panel is electrically interchangeable.

Use a short button-activated display interval. Show charge remaining on the main view, then learned battery health on a second view. Show `--` until the gauge has valid data for the installed cell. The compact MAX17311 proposal replaces the earlier MAX17260 gauge plus separate protector. Neither option, the MCU, display supply, button nor cell identification is on the routed boost PCB. A generic MAX17260 board with a 10 mΩ sense resistor clips above 5.12 A; that alternative requires a selected shunt and calibrated current path. The two-wire A30 plug has no data contact for cartridge identity, so the proposed smart cartridge needs a revised interface. Their costs are not included in the C$85 to C$150 sample allowance. See [power-design.md](../electronics/power-design.md) for the measurement and power requirements.

## Bench equipment, only if missing

| Item | AliExpress search | What it resolves |
|---|---|---|
| VIFLY WhoopStor 3 | [WhoopStor 3](https://www.aliexpress.com/w/wholesale-VIFLY-WhoopStor-3.html) | Independent 1S charging and storage mode |
| USB-C PD source, 45 W or greater | [65 W source](https://www.aliexpress.com/w/wholesale-USB-C-PD-65W-charger-12V-15V-20V.html) | Powers the cell charger; reuse a compatible source |
| FNIRSI FNB58 | [FNB58](https://www.aliexpress.com/w/wholesale-FNIRSI-FNB58-USB-tester.html) | USB voltage, current, energy and PD negotiation |
| ATORCH DL24, 150 W kit | [DL24](https://www.aliexpress.com/w/wholesale-ATORCH-DL24-150W-electronic-load-kit.html) | Controlled load for cell and USB output tests |
| UNI-T UT320D with two probes | [UT320D](https://www.aliexpress.com/w/wholesale-UNI-T-UT320D-dual-thermocouple.html) | Cell and converter temperature measurements |

The [WhoopStor specifications](https://viflydrone.com/products/vifly-whoopstor-6-ports-1s-battery-storage-charger-discharger) give 0.3 to 1.3 A charging, 4.20/4.35 V targets, PH2.0/BT2.0 connectors, and a 9 to 20 V USB-C input with a 40 W minimum source. A 5 V-only charger will not work. Start the cell plan at 0.8 A and nominal 4.20 V. The manufacturer specifies ±0.05 V termination tolerance, so this mode can reach 4.25 V. It cannot enforce a strict 4.20 V ceiling; that requires a precision charger or independent termination circuit. Match the gauge baseline to measured termination. This deliberately gives up some nominal capacity; do not use the 3.23 Wh nominal figure as measured available energy at that setting. Confirm the exact cell's permitted charge termination before using 4.35 V. Verify the charger's selected voltage and polarity each time. Its selected white variant was shown as sold out on the manufacturer page.

The [FNB58](https://www.fnirsi.com/products/fnb58) measures 4 to 28 V and 0 to 7 A. It is a USB meter and trigger, not an electronic load. Use its trigger function with the load during development. The [DL24 manufacturer manual](https://en.atorch.cn/upload/20241224153104.pdf) was indexed with 2 to 200 V, 0 to 20 A and 150 W specifications; the live PDF fetch timed out. Verify the exact hardware revision and auxiliary supply before ordering. The [UT320D](https://meters.uni-trend.com/product/ut320-series) accepts two K/J probes. Electrically insulate conductive probe beads from live conductors.

## Cost and purchase gates

The sample parts and prototype material have a planning allowance of C$85 to C$150. The listed bench tools add C$211 to C$352 if none are owned. These are estimated line-item allowances, not vendor quotes. Shipping, tax and import fees remain unknown. Custom PCB fabrication, assembly, a bench supply, machining and product qualification are excluded. No reliable all-in total exists until the checkout and fabrication quotes are available.

Hold generic power-bank modules and PCB components until the circuit selection in [power-design.md](../electronics/power-design.md) is settled. A 22.5 W board misses the retained 25 W design target. A PD trigger board requests power; it cannot replace a PD source controller. A high-current battery lead does not replace overcurrent, undervoltage or temperature protection.

For a finished pocket product, obtain a traceable cell specification covering cycle life, temperature and charged storage, then verify those limits with the selected protection circuit and enclosure. The remaining electrical purchases depend on that circuit and layout review.

AliExpress access was blocked by the browser's site-safety policy in the previous chat. The tool explicitly prohibited alternate browsers and indirect workarounds. No automatic approval review or user-permission prompt occurred. The sourcing work therefore uses manufacturer specifications and unverified AliExpress search links.
