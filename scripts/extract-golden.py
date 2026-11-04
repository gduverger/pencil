#!/usr/bin/env python3
"""
Extract golden values from the reference workbooks (spec 12.3).

Usage:
    python3 scripts/extract-golden.py reference/ packages/engine/test/golden/ [--mappings scripts/golden-mappings]

For every mapping file in --mappings (one per model, see golden-mappings/README.md) this script
opens the workbook named in the mapping with cached values (openpyxl data_only=True for .xlsm/.xlsx,
pyxlsb for .xlsb), reads the input cells and the expected output cells, and writes
<out>/<model>.json as { model, file, inputs, expected, cells, missing }. Cell addresses are copied
into the JSON so the mapping is auditable. A workbook that is absent or cannot be parsed is reported
and skipped; the script never fails silently and exits non-zero only on a usage error.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def read_xlsx(path: Path):
    import openpyxl  # type: ignore

    wb = openpyxl.load_workbook(path, data_only=True, read_only=True, keep_vba=False)

    def get(sheet: str, cell: str):
        ws = wb[sheet]
        return ws[cell].value

    def sheets():
        return wb.sheetnames

    return get, sheets


def read_xlsb(path: Path):
    from pyxlsb import open_workbook  # type: ignore
    from openpyxl.utils.cell import coordinate_from_string, column_index_from_string  # type: ignore

    wb = open_workbook(str(path))
    cache: dict[str, dict[tuple[int, int], object]] = {}

    def load(sheet: str):
        if sheet not in cache:
            grid: dict[tuple[int, int], object] = {}
            with wb.get_sheet(sheet) as ws:
                for row in ws.rows():
                    for c in row:
                        if c.v is not None:
                            grid[(c.r + 1, c.c + 1)] = c.v
            cache[sheet] = grid
        return cache[sheet]

    def get(sheet: str, cell: str):
        col, row = coordinate_from_string(cell)
        return load(sheet).get((row, column_index_from_string(col)))

    def sheets():
        return list(wb.sheets)

    return get, sheets


def read_cell(get, ref: str):
    """ref is 'Sheet!A1' or a list of them (an annual series)."""
    sheet, _, cell = ref.rpartition("!")
    if not sheet:
        raise ValueError(f"cell reference {ref!r} must be Sheet!A1")
    return get(sheet.strip("'"), cell)


def extract(mapping: dict, reference_dir: Path) -> dict:
    model = mapping["model"]
    file = reference_dir / mapping["file"]
    result = {"model": model, "file": mapping["file"], "inputs": {}, "expected": {}, "cells": mapping, "missing": [], "notes": mapping.get("notes", [])}
    if not file.exists():
        result["missing"].append(f"workbook not found: {file}")
        return result
    try:
        get, _sheets = read_xlsb(file) if file.suffix.lower() == ".xlsb" else read_xlsx(file)
    except Exception as e:  # noqa: BLE001
        result["missing"].append(f"workbook could not be parsed: {e}")
        return result
    for section in ("inputs", "expected"):
        for name, ref in mapping.get(section, {}).items():
            if ref in (None, "", "TBD") or (isinstance(ref, list) and any(r in ("TBD", "", None) for r in ref)):
                result["missing"].append(f"{section}.{name}: cell address TBD")
                continue
            try:
                if isinstance(ref, list):
                    values = [read_cell(get, r) for r in ref]
                    if any(v is None for v in values):
                        result["missing"].append(f"{section}.{name}: no cached value in one of {ref}")
                    result[section][name] = {"cells": ref, "value": values}
                else:
                    value = read_cell(get, ref)
                    if value is None:
                        result["missing"].append(f"{section}.{name}: no cached value at {ref}")
                    result[section][name] = {"cell": ref, "value": value}
            except Exception as e:  # noqa: BLE001
                result["missing"].append(f"{section}.{name}: {e}")
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("reference_dir", type=Path)
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--mappings", type=Path, default=Path("scripts/golden-mappings"))
    args = ap.parse_args()
    mappings = sorted(args.mappings.glob("*.json"))
    if not mappings:
        print(f"no mapping files in {args.mappings}", file=sys.stderr)
        return 2
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for path in mappings:
        mapping = json.loads(path.read_text())
        result = extract(mapping, args.reference_dir)
        out = args.out_dir / f"{mapping['model']}.json"
        if result["missing"] and not result["expected"]:
            print(f"[{mapping['model']}] skipped: {'; '.join(result['missing'][:3])}")
            continue
        out.write_text(json.dumps(result, indent=2, default=str) + "\n")
        print(f"[{mapping['model']}] wrote {out} ({len(result['expected'])} expected values, {len(result['missing'])} missing)")
        for m in result["missing"]:
            print(f"    missing: {m}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
