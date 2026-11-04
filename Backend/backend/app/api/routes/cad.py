"""Generic CAD inspection for user-added components (any industry).

The browser reads mesh formats (STL, OBJ, PLY, 3MF, glTF) itself. Exact B-rep
formats (STEP, IGES, BREP) need a CAD kernel, so they come here: the file is
read with OpenCascade (via CadQuery), measured exactly, tessellated to a mesh
the browser can show, and then deleted. Nothing is stored on the server.
"""
from __future__ import annotations

import base64
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter(tags=["cad"])

BREP_SUFFIXES = (".step", ".stp", ".iges", ".igs", ".brep", ".brp")


def _load_shape(path: Path, suffix: str):
    import cadquery as cq

    if suffix in (".step", ".stp"):
        return cq.importers.importStep(str(path))
    if suffix in (".brep", ".brp"):
        return cq.importers.importBrep(str(path))
    # IGES: CadQuery has no importer, so read it with OpenCascade directly.
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.IGESControl import IGESControl_Reader

    reader = IGESControl_Reader()
    if reader.ReadFile(str(path)) != IFSelect_RetDone:
        raise ValueError("the IGES file could not be read")
    reader.TransferRoots()
    shape = reader.OneShape()
    if shape is None or shape.IsNull():
        raise ValueError("the IGES file contains no geometry")
    return cq.Workplane("XY").add(cq.Shape.cast(shape))


def inspect_brep(path: Path, suffix: str) -> dict[str, Any]:
    """Measure a B-rep file in millimetres and tessellate it for display."""
    import cadquery as cq

    wp = _load_shape(path, suffix)
    shapes = wp.vals()
    if not shapes:
        raise ValueError("the file contains no geometry")
    compound = cq.Compound.makeCompound([s for s in shapes if isinstance(s, cq.Shape)])
    solids = compound.Solids()
    faces = compound.Faces()
    if not faces:
        raise ValueError("the file contains no surfaces")

    bb = compound.BoundingBox()
    diag = max(bb.DiagonalLength, 1e-6)
    volume_mm3 = float(sum(s.Volume() for s in solids)) if solids else 0.0
    area_mm2 = float(sum(f.Area() for f in faces))

    valid = True
    try:
        valid = bool(compound.isValid())
    except Exception:  # pragma: no cover
        valid = False

    # Tessellate: tolerance scales with part size so a 5 mm clip and a 5 m
    # beam both come out at a sensible triangle count.
    vertices, triangles = compound.tessellate(diag * 1e-3, 0.3)
    flat: list[float] = []
    for a, b, c in triangles:
        for i in (a, b, c):
            v = vertices[i]
            flat.extend((v.x, v.y, v.z))
    import array

    buf = array.array("f", flat).tobytes()

    warnings: list[str] = []
    if not solids:
        warnings.append("no closed solid body: only surfaces were found, so volume and mass are not available")
    elif len(solids) > 1:
        warnings.append(f"{len(solids)} separate solids; they are measured together as one part")
    if not valid:
        warnings.append("OpenCascade reports the geometry as invalid; meshing for analysis may fail")

    units: dict[str, Any] = {"declared_length_unit": None}
    if suffix in (".step", ".stp"):
        from app.engineering.cad.importer import read_declared_units

        units = read_declared_units(path)

    return {
        "kernel": "OpenCascade (CadQuery)",
        "units_mm": True,
        "solid_count": len(solids),
        "face_count": len(faces),
        "is_valid": valid,
        "volume_mm3": volume_mm3 if solids else None,
        "surface_area_mm2": area_mm2,
        "bbox_min_mm": [bb.xmin, bb.ymin, bb.zmin],
        "bbox_max_mm": [bb.xmax, bb.ymax, bb.zmax],
        "triangle_count": len(triangles),
        "positions_f32_b64": base64.b64encode(buf).decode("ascii"),
        "units": units,
        "warnings": warnings,
    }


@router.post("/cad/inspect")
async def inspect_cad(file: UploadFile = File(...)) -> dict[str, Any]:
    """Read a STEP / IGES / BREP file and return exact measurements plus a display mesh."""
    name = file.filename or "upload.step"
    suffix = Path(name).suffix.lower()
    if suffix not in BREP_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported file type {suffix!r}; this route reads {', '.join(BREP_SUFFIXES)}",
        )
    data = await file.read()
    limit = get_settings().max_upload_bytes
    if not data:
        raise HTTPException(status_code=400, detail="uploaded file is empty")
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"file is {len(data) / 1e6:.1f} MB, above the {limit / 1e6:.0f} MB limit")

    with tempfile.TemporaryDirectory(prefix="autotwin-cad-") as tmp:
        path = Path(tmp) / f"upload{suffix}"  # generated name; the user's filename never touches the disk
        path.write_bytes(data)
        try:
            result = inspect_brep(path, suffix)
        except HTTPException:
            raise
        except Exception as exc:
            log.info("cad inspect failed for %s: %s", suffix, exc)
            raise HTTPException(status_code=422, detail=f"could not read the file as {suffix[1:].upper()} geometry: {exc}") from exc
    log.info("cad inspect %s: %d faces, %d triangles", suffix, result["face_count"], result["triangle_count"])
    return {"file_name": name, **result}
