const assert = require("node:assert/strict");
const test = require("node:test");
const { collectImplementationTypeDetail } = require("../src/model/implementationTypeDetails.ts");

test("preserves nested implementation type members and their own references", () => {
  const record = {
    "SHORT-NAME": "NestedPacket",
    CATEGORY: "STRUCTURE",
    "SUB-ELEMENTS": {
      "IMPLEMENTATION-DATA-TYPE-ELEMENT": [{
        "SHORT-NAME": "Header",
        CATEGORY: "STRUCTURE",
        "SUB-ELEMENTS": {
          "IMPLEMENTATION-DATA-TYPE-ELEMENT": {
            "SHORT-NAME": "Code",
            CATEGORY: "TYPE_REFERENCE",
            "SW-DATA-DEF-PROPS": {
              "SW-DATA-DEF-PROPS-VARIANTS": {
                "SW-DATA-DEF-PROPS-CONDITIONAL": {
                  "IMPLEMENTATION-DATA-TYPE-REF": "/ImaginaryTypes/SmallCode"
                }
              }
            }
          }
        }
      }, {
        "SHORT-NAME": "Samples",
        CATEGORY: "ARRAY",
        "ARRAY-SIZE": "8",
        "ARRAY-SIZE-SEMANTICS": "FIXED-SIZE",
        "SW-DATA-DEF-PROPS": {
          "SW-DATA-DEF-PROPS-VARIANTS": {
            "SW-DATA-DEF-PROPS-CONDITIONAL": {
              "BASE-TYPE-REF": "/ImaginaryTypes/ByteBase"
            }
          }
        }
      }]
    }
  };

  const detail = collectImplementationTypeDetail(record);
  assert.equal(detail.category, "STRUCTURE");
  assert.equal(detail.references.length, 0, "nested references must not leak to the parent");
  assert.equal(detail.elements[0].name, "Header");
  assert.equal(detail.elements[0].children[0].name, "Code");
  assert.deepEqual(detail.elements[0].children[0].references, [
    { label: "Implementation Data Type", path: "/ImaginaryTypes/SmallCode" }
  ]);
  assert.equal(detail.elements[1].arraySize, "8");
  assert.equal(detail.elements[1].sizeSemantics, "FIXED-SIZE");
  assert.deepEqual(detail.elements[1].references, [
    { label: "Base Type", path: "/ImaginaryTypes/ByteBase" }
  ]);
});

test("reads data-reference targets from pointer properties", () => {
  const detail = collectImplementationTypeDetail({
    CATEGORY: "DATA_REFERENCE",
    "SW-DATA-DEF-PROPS": {
      "SW-DATA-DEF-PROPS-VARIANTS": {
        "SW-DATA-DEF-PROPS-CONDITIONAL": {
          "SW-POINTER-TARGET-PROPS": {
            "SW-DATA-DEF-PROPS": {
              "SW-DATA-DEF-PROPS-VARIANTS": {
                "SW-DATA-DEF-PROPS-CONDITIONAL": {
                  "IMPLEMENTATION-DATA-TYPE-REF": "/ImaginaryTypes/TargetRecord"
                }
              }
            }
          }
        }
      }
    }
  });

  assert.deepEqual(detail.references, [
    { label: "Implementation Data Type", path: "/ImaginaryTypes/TargetRecord" }
  ]);
});
