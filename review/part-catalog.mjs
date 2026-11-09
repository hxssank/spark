export const partCatalog = {
  "sleeve": {
    "label": "Outer sleeve",
    "category": "case",
    "detail": "The printed sleeve holds the carrier and cell cover. The graphite finish is a study for a later aluminium version.",
    "status": "Printable design",
    "specs": [
      "24 × 14.8 × 112 mm envelope"
    ],
    "provenance": [
      {
        "label": "Print STL",
        "href": "../mechanical/print_parts/sleeve.stl"
      },
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  },
  "carrier": {
    "label": "Insulating carrier",
    "category": "case",
    "detail": "Locates the cell and PCB. The rear opening holds the display candidate without changing the cell pocket.",
    "status": "Printable design",
    "specs": [
      "24 × 14.8 × 113 mm envelope"
    ],
    "provenance": [
      {
        "label": "Print STL",
        "href": "../mechanical/print_parts/carrier.stl"
      },
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  },
  "front_cover": {
    "label": "Cell cover",
    "category": "case",
    "detail": "Covers the cell and slides under the sleeve. No fastener enters the pouch pocket.",
    "status": "Printable design",
    "specs": [
      "20.7 × 0.8 × 68 mm envelope"
    ],
    "provenance": [
      {
        "label": "Print STL",
        "href": "../mechanical/print_parts/front_cover.stl"
      },
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  },
  "bottom_cap": {
    "label": "Bottom cap",
    "category": "case",
    "detail": "Closes the lower end with two M2 × 3 mm screws. The plastic threads still need a pullout and reuse test.",
    "status": "Printable design",
    "specs": [
      "24 × 14.8 × 3 mm envelope"
    ],
    "provenance": [
      {
        "label": "Print STL",
        "href": "../mechanical/print_parts/bottom_cap.stl"
      },
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  },
  "battery_reference": {
    "label": "GNB 850 mAh cell",
    "category": "cell",
    "status": "Sample candidate",
    "detail": "GNB8501S60WHV manufacturer pack dimensions. The supplier does not define whether seams, lead exit or connector are included; check a sample.",
    "specs": [
      "66 × 18 × 7.7 mm nominal",
      "850 mAh at 3.8 V, manufacturer specification"
    ],
    "provenance": [
      {
        "label": "Cell manufacturer",
        "href": "https://www.gaoneng.shop/products/gaoneng-gnb-lihv-1s-3.8v-850mah-60c-a30-cabled-lipo-battery-long-range"
      },
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  },
  "a30_unmeasured_reference": {
    "label": "A30 connector allowance",
    "category": "cell",
    "status": "Unmeasured allowance",
    "detail": "A 6 × 6 × 12 mm placeholder for the mating connector. Terminal positions, lead bend and installed size are not measured.",
    "specs": [
      "6 × 6 × 12 mm allowance"
    ],
    "provenance": [
      {
        "label": "Connector manufacturer",
        "href": "https://www.gaoneng.shop/products/gaoneng-a30-connector-adapter-for-fpv-whoops-quads-lipo-battery"
      },
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  },
  "pcb_reference": {
    "label": "Boost test board",
    "category": "electronics",
    "status": "Routed design",
    "detail": "The four-layer board converts a bench supply to 5 V or 9 V. It has no USB-C PD, charger, cell protection, temperature cutoff or output isolation.",
    "specs": [
      "38 × 20 × 1 mm",
      "4 layers; 2/1/1/2 oz copper"
    ],
    "provenance": [
      {
        "label": "KiCad PCB",
        "href": "../electronics/boost-prototype/spark_boost_rev_a.kicad_pcb"
      },
      {
        "label": "Schematic PDF",
        "href": "../electronics/boost-prototype/spark_boost_rev_a.pdf"
      }
    ]
  },
  "usb_reference": {
    "label": "USB-C socket allowance",
    "category": "electronics",
    "status": "Provisional location",
    "detail": "A generic socket body reserves the port position. The selected connector, support, wiring and PD circuit still need design.",
    "specs": [
      "10.4 × 4.6 mm case opening",
      "0.5 mm recess"
    ],
    "provenance": [
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  },
  "usb_tongue_reference": {
    "label": "USB-C tongue allowance",
    "category": "electronics",
    "status": "Provisional location",
    "detail": "Visual tongue inside the generic socket. It does not represent electrical contacts or a working connector.",
    "specs": [
      "6.6 × 0.5 × 5.8 mm visual allowance"
    ],
    "provenance": [
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  },
  "u1_reference": {
    "label": "U1 · Boost converter",
    "category": "electronics",
    "detail": "TPS61288L raises the input voltage. Its shutdown input does not isolate the output or protect a cell.",
    "status": "Selected component",
    "specs": [
      "TPS61288LRQQR",
      "Front of PCB; 3.1 × 2.6 mm body",
      "1 mm maximum body height, before solder"
    ],
    "provenance": [
      {
        "label": "Component source",
        "href": "https://www.ti.com/lit/ds/symlink/tps61288.pdf"
      },
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "u1_reference"
  },
  "inductor_reference": {
    "label": "L1 · Power inductor",
    "category": "electronics",
    "detail": "2.2 µH Coilcraft XAL1060. Mount its marked short winding lead toward the SW label on the board.",
    "status": "Selected component",
    "specs": [
      "2.2uH XAL1060-222MEC",
      "Front of PCB; 11.8 × 10.5 mm body",
      "6 mm maximum body height, before solder"
    ],
    "provenance": [
      {
        "label": "Component source",
        "href": "https://www.coilcraft.com/getmedia/8909f858-b441-4d60-acff-8b8ca36f9ede/xal1060.pdf"
      },
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "inductor_reference"
  },
  "input_cap_reference": {
    "label": "C1 · Input capacitor",
    "category": "electronics",
    "detail": "22 µF input capacitor. Effective capacitance and installed temperature still need measurement.",
    "status": "Selected component",
    "specs": [
      "22uF 25V X7R 1210",
      "Front of PCB; 2.7 × 3.5 mm body",
      "2.7 mm maximum body height, before solder"
    ],
    "provenance": [
      {
        "label": "Component source",
        "href": "https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM32ER71E226KE15-04CA.pdf"
      },
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "input_cap_reference"
  },
  "c2_unmeasured_reference": {
    "label": "C2 · VIN bypass capacitor",
    "category": "electronics",
    "detail": "100 nF local bypass on the converter input supply. Exact manufacturer part and height remain unselected.",
    "status": "Part unselected",
    "specs": [
      "100nF 25V X7R 0402",
      "Front of PCB; 0.5 × 1 mm body"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "c2_unmeasured_reference"
  },
  "c3_unmeasured_reference": {
    "label": "C3 · VCC capacitor",
    "category": "electronics",
    "detail": "4.7 µF KYOCERA AVX capacitor for the converter internal bias supply. Installed height and effective capacitance remain unverified.",
    "status": "Selected component",
    "specs": [
      "4.7uF 10V X5R 0603",
      "Front of PCB; 1.6 × 0.8 mm body"
    ],
    "provenance": [
      {
        "label": "Component source",
        "href": "https://www.ti.com/lit/pdf/SLVUBW6"
      },
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "c3_unmeasured_reference"
  },
  "c4_unmeasured_reference": {
    "label": "C4 · Bootstrap capacitor",
    "category": "electronics",
    "detail": "100 nF between BST and SW. Exact manufacturer part and height remain unselected.",
    "status": "Part unselected",
    "specs": [
      "100nF 25V X7R 0402",
      "Front of PCB; 1 × 0.5 mm body"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "c4_unmeasured_reference"
  },
  "c5_reference": {
    "label": "C5 · Output capacitor",
    "category": "electronics",
    "detail": "One of six 22 µF output capacitors. The bank is 132 µF nominal; the compensation requires at least 60 µF effective under bias.",
    "status": "Selected component",
    "specs": [
      "22uF 25V X7R 1210",
      "Rear of PCB; 2.7 × 3.5 mm body",
      "2.7 mm maximum body height, before solder"
    ],
    "provenance": [
      {
        "label": "Component source",
        "href": "https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM32ER71E226KE15-04CA.pdf"
      },
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "c5_reference"
  },
  "c6_reference": {
    "label": "C6 · Output capacitor",
    "category": "electronics",
    "detail": "One of six 22 µF output capacitors. The bank is 132 µF nominal; the compensation requires at least 60 µF effective under bias.",
    "status": "Selected component",
    "specs": [
      "22uF 25V X7R 1210",
      "Rear of PCB; 2.7 × 3.5 mm body",
      "2.7 mm maximum body height, before solder"
    ],
    "provenance": [
      {
        "label": "Component source",
        "href": "https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM32ER71E226KE15-04CA.pdf"
      },
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "c5_reference"
  },
  "c7_reference": {
    "label": "C7 · Output capacitor",
    "category": "electronics",
    "detail": "One of six 22 µF output capacitors. The bank is 132 µF nominal; the compensation requires at least 60 µF effective under bias.",
    "status": "Selected component",
    "specs": [
      "22uF 25V X7R 1210",
      "Rear of PCB; 2.7 × 3.5 mm body",
      "2.7 mm maximum body height, before solder"
    ],
    "provenance": [
      {
        "label": "Component source",
        "href": "https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM32ER71E226KE15-04CA.pdf"
      },
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "c5_reference"
  },
  "c8_reference": {
    "label": "C8 · Output capacitor",
    "category": "electronics",
    "detail": "One of six 22 µF output capacitors. The bank is 132 µF nominal; the compensation requires at least 60 µF effective under bias.",
    "status": "Selected component",
    "specs": [
      "22uF 25V X7R 1210",
      "Rear of PCB; 2.7 × 3.5 mm body",
      "2.7 mm maximum body height, before solder"
    ],
    "provenance": [
      {
        "label": "Component source",
        "href": "https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM32ER71E226KE15-04CA.pdf"
      },
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "c5_reference"
  },
  "c9_reference": {
    "label": "C9 · Output capacitor",
    "category": "electronics",
    "detail": "One of six 22 µF output capacitors. The bank is 132 µF nominal; the compensation requires at least 60 µF effective under bias.",
    "status": "Selected component",
    "specs": [
      "22uF 25V X7R 1210",
      "Rear of PCB; 2.7 × 3.5 mm body",
      "2.7 mm maximum body height, before solder"
    ],
    "provenance": [
      {
        "label": "Component source",
        "href": "https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM32ER71E226KE15-04CA.pdf"
      },
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "c5_reference"
  },
  "c10_reference": {
    "label": "C10 · Output capacitor",
    "category": "electronics",
    "detail": "One of six 22 µF output capacitors. The bank is 132 µF nominal; the compensation requires at least 60 µF effective under bias.",
    "status": "Selected component",
    "specs": [
      "22uF 25V X7R 1210",
      "Rear of PCB; 2.7 × 3.5 mm body",
      "2.7 mm maximum body height, before solder"
    ],
    "provenance": [
      {
        "label": "Component source",
        "href": "https://search.murata.co.jp/Ceramy/image/img/A01X/G101/ENG/GRM32ER71E226KE15-04CA.pdf"
      },
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "c5_reference"
  },
  "r1_unmeasured_reference": {
    "label": "R1 · Feedback upper resistor",
    "category": "electronics",
    "detail": "110 kΩ upper leg of the output-voltage divider.",
    "status": "Part unselected",
    "specs": [
      "110k 0.1% 0402",
      "Front of PCB; 1 × 0.5 mm body"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "r1_unmeasured_reference"
  },
  "r2_unmeasured_reference": {
    "label": "R2 · Feedback lower resistor",
    "category": "electronics",
    "detail": "15 kΩ lower leg sets 5 V with R1 when JP1 is open.",
    "status": "Part unselected",
    "specs": [
      "15k 0.1% 0402",
      "Front of PCB; 1 × 0.5 mm body"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "r1_unmeasured_reference"
  },
  "r3_unmeasured_reference": {
    "label": "R3 · 9 V selection resistor",
    "category": "electronics",
    "detail": "16.5 kΩ joins the lower feedback leg when JP1 is closed, selecting 9 V.",
    "status": "Part unselected",
    "specs": [
      "16.5k 0.1% 0402",
      "Front of PCB; 1 × 0.5 mm body"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "r1_unmeasured_reference"
  },
  "jp1_pad_reference": {
    "label": "JP1 · Voltage selection jumper",
    "category": "electronics",
    "detail": "Leave open for 5 V. Close for 9 V only with input power disconnected. This is a solder jumper, not a USB-C negotiation circuit.",
    "status": "PCB feature",
    "specs": [
      "9V SELECT NORMALLY OPEN"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "jp1_pad_reference"
  },
  "r4_unmeasured_reference": {
    "label": "R4 · Compensation resistor",
    "category": "electronics",
    "detail": "12.4 kΩ resistor in the proposed loop-compensation network. Stability has not been measured.",
    "status": "Part unselected",
    "specs": [
      "12.4k 1% 0402",
      "Rear of PCB; 1 × 0.5 mm body"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "r4_unmeasured_reference"
  },
  "c11_unmeasured_reference": {
    "label": "C11 · Compensation capacitor",
    "category": "electronics",
    "detail": "8.2 nF capacitor in the proposed loop-compensation network.",
    "status": "Part unselected",
    "specs": [
      "8.2nF C0G 0402",
      "Rear of PCB; 1 × 0.5 mm body"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "r4_unmeasured_reference"
  },
  "c12_unmeasured_reference": {
    "label": "C12 · Compensation filter capacitor",
    "category": "electronics",
    "detail": "10 pF capacitor from COMP to ground.",
    "status": "Part unselected",
    "specs": [
      "10pF C0G 0402",
      "Rear of PCB; 1 × 0.5 mm body"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "r4_unmeasured_reference"
  },
  "r5_unmeasured_reference": {
    "label": "R5 · Enable pulldown",
    "category": "electronics",
    "detail": "100 kΩ holds the converter disabled when the enable pad is open.",
    "status": "Part unselected",
    "specs": [
      "100k 0402",
      "Front of PCB; 1 × 0.5 mm body"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "r5_unmeasured_reference"
  },
  "j1_pad_reference": {
    "label": "J1 · Input positive pad",
    "category": "electronics",
    "detail": "Connect the isolated current-limited bench supply positive here. Prototype input range is 3.0–4.2 V.",
    "status": "PCB feature",
    "specs": [
      "VIN +"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "j1_pad_reference"
  },
  "j2_pad_reference": {
    "label": "J2 · Input ground pad",
    "category": "electronics",
    "detail": "Bench-supply return and reference for the external enable control.",
    "status": "PCB feature",
    "specs": [
      "VIN GND"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "j1_pad_reference"
  },
  "j3_pad_reference": {
    "label": "J3 · Output positive pad",
    "category": "electronics",
    "detail": "Connect to an electronic load. This is not a phone charging connection.",
    "status": "PCB feature",
    "specs": [
      "VOUT +"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "j3_pad_reference"
  },
  "j4_pad_reference": {
    "label": "J4 · Output ground pad",
    "category": "electronics",
    "detail": "Electronic-load return.",
    "status": "PCB feature",
    "specs": [
      "VOUT GND"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "j3_pad_reference"
  },
  "j5_pad_reference": {
    "label": "J5 · Enable pad",
    "category": "electronics",
    "detail": "Drive with an external 3.3 V control signal referenced to J2. EN does not disconnect the output.",
    "status": "PCB feature",
    "specs": [
      "ENABLE 1.2-4.2V"
    ],
    "provenance": [
      {
        "label": "Circuit source",
        "href": "../electronics/boost-prototype/circuit.json"
      },
      {
        "label": "Board placement",
        "href": "../electronics/boost-prototype/component-placement.json"
      }
    ],
    "detailId": "j5_pad_reference"
  },
  "display_glass_reference": {
    "label": "0.6-inch colour OLED",
    "category": "display",
    "status": "Panel candidate",
    "detail": "RB060-6464TDDBG01. The glass fits the current model; its flex drawing, connector, electrical supply and retention still need confirmation.",
    "specs": [
      "15 × 17.5 × 1.2 mm glass",
      "64 × 64 RGB pixels"
    ],
    "provenance": [
      {
        "label": "Display manufacturer",
        "href": "https://www.ronboe.com/shop/rb060-6464tddbg01/"
      },
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  },
  "display_active_reference": {
    "label": "OLED active area",
    "category": "display",
    "status": "Visual reference",
    "detail": "The preview draws an example charge or capacity-health screen. No telemetry is connected; real readings remain unknown.",
    "specs": [
      "10.73 × 10.73 mm active area",
      "Centred position provisional"
    ],
    "provenance": [
      {
        "label": "Display manufacturer",
        "href": "https://www.ronboe.com/shop/rb060-6464tddbg01/"
      },
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  },
  "display_lens_reference": {
    "label": "Flush cover glass",
    "category": "display",
    "status": "Provisional part",
    "detail": "The cover glass sits flush with the sleeve exterior and stays on the sleeve during removal. The 3D preview studies a colour-matched finish that hides the window and reveals only lit pixels. Coating transmission, colour match, adhesive and service method remain unverified.",
    "specs": [
      "16.8 × 19.3 × 0.5 mm"
    ],
    "provenance": [
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  },
  "display_fpc_keepout_reference": {
    "label": "OLED flex allowance",
    "category": "display",
    "status": "Unmeasured allowance",
    "detail": "Space reserved for the flex and connector. This block is not a cable or a verified bend path.",
    "specs": [
      "12 × 1.5 × 5 mm reserved"
    ],
    "provenance": [
      {
        "label": "Mechanical contract",
        "href": "../mechanical/mechanical-contract.json"
      }
    ]
  }
};
