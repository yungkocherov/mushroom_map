"""Считает уникальные eid'ы выделов в скачанных FGIS LK тайлах по зумам.

Используется как diagnostic при выборе merge-стратегии в fgislk_tiles_to_geojson.py:
сколько полигонов потеряем, если дропнем zoom=N из источников.
"""
from __future__ import annotations

import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import mapbox_vector_tile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipelines"))
from fgislk_tiles_to_geojson import TARGET_SOURCE_LAYER  # noqa: E402


def scan_chunk(args_list):
    eids = set()
    for path_str in args_list:
        try:
            decoded = mapbox_vector_tile.decode(Path(path_str).read_bytes())
        except Exception:
            continue
        layer = decoded.get(TARGET_SOURCE_LAYER)
        if not layer:
            continue
        for f in layer.get("features") or []:
            eid = (f.get("properties") or {}).get("externalid")
            if eid:
                eids.add(str(eid))
    return eids


def collect_eids(zoom: int) -> set[str]:
    files = list(Path(f"data/rosleshoz/fgislk_tiles/{zoom}").rglob("*.pbf"))
    print(f"  z={zoom}: scanning {len(files)} tiles...", flush=True)
    if not files:
        return set()
    n_workers = max(1, (os.cpu_count() or 4) - 1)
    args = [str(f) for f in files]
    batch_size = max(50, len(args) // (n_workers * 4))
    batches = [args[i:i + batch_size] for i in range(0, len(args), batch_size)]
    all_eids: set[str] = set()
    with ProcessPoolExecutor(max_workers=n_workers) as ex:
        futures = [ex.submit(scan_chunk, b) for b in batches]
        done = 0
        for fut in as_completed(futures):
            all_eids |= fut.result()
            done += 1
            if done % 5 == 0 or done == len(batches):
                print(f"    {done}/{len(batches)} batches  partial unique={len(all_eids):,}", flush=True)
    print(f"  z={zoom}: unique eids = {len(all_eids):,}", flush=True)
    return all_eids


def main() -> None:
    eids_by_zoom: dict[int, set[str]] = {}
    for z in (10, 11, 12):
        eids_by_zoom[z] = collect_eids(z)

    total: set[str] = set()
    for s in eids_by_zoom.values():
        total |= s

    only_z10 = eids_by_zoom[10] - eids_by_zoom[11] - eids_by_zoom[12]
    only_z11 = eids_by_zoom[11] - eids_by_zoom[10] - eids_by_zoom[12]
    only_z12 = eids_by_zoom[12] - eids_by_zoom[10] - eids_by_zoom[11]
    z10_or_z11 = eids_by_zoom[10] | eids_by_zoom[11]

    print()
    print(f"TOTAL unique eids overall: {len(total):,}")
    print(f"  z=10:         {len(eids_by_zoom[10]):,}")
    print(f"  z=11:         {len(eids_by_zoom[11]):,}")
    print(f"  z=12:         {len(eids_by_zoom[12]):,}")
    print(f"  z=10 or z=11: {len(z10_or_z11):,}")
    print()
    print(f"ONLY in z=10:  {len(only_z10):,}")
    print(f"ONLY in z=11:  {len(only_z11):,}")
    print(f"ONLY in z=12:  {len(only_z12):,}    <- столько ПОТЕРЯЕМ при drop z=12")


if __name__ == "__main__":
    main()
