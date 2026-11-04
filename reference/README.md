# Reference workbooks

`docs/SPEC.md` section 12.3 names five Excel workbooks whose cached values are the standard the
engine must reproduce:

1. `915 E Bethany Home Rd BOE 20211116v03 PPM Version.xlsm`
2. `Student_Housing_Development_v18.xlsm`
3. `ApartmentDevelopmentModel_v2.95.xlsm`
4. `AustellModel20190113v01_ed1.7mm.xlsm`
5. `A.CREAi1UW_v0.893.xlsb`

They were not supplied with the specification, so this directory is empty. When they are added
here, run `python3 scripts/extract-golden.py reference/ packages/engine/test/golden/` to produce
the golden JSON files, then write the per-model adapters in `packages/engine/test/golden/adapters/`.
