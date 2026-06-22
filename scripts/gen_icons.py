#!/usr/bin/env python3
"""Generate Cetele PWA icons (stdlib-only, no PIL).
Design: Youth Nexus navy field + an orange open progress ring (the core motif).
Outputs PNGs to public/icons/. Re-run after changing the design here.
"""
import os, struct, zlib, math

NAVY = (0x1D, 0x3A, 0x5F)   # Youth Nexus primary
ORANGE = (0xF2, 0x65, 0x22)  # Youth Nexus accent
BG = NAVY
RING = ORANGE
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "icons")


def _chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data +
            struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))


def write_png(path, size, ring_outer=0.40, ring_inner=0.30, gap_deg=70):
    """Solid green canvas with a centred white ring that has a top gap
    (an 'open ring', evoking progress not yet complete)."""
    cx = cy = size / 2.0
    ro, ri = ring_outer * size, ring_inner * size
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # filter type 0
        for x in range(size):
            dx, dy = x - cx + 0.5, y - cy + 0.5
            dist = math.hypot(dx, dy)
            r, g, b = BG
            if ri <= dist <= ro:
                # angle measured from top, clockwise; leave a gap at the top
                ang = (math.degrees(math.atan2(dx, -dy)) + 360) % 360
                if not (360 - gap_deg / 2 <= ang or ang <= gap_deg / 2):
                    r, g, b = RING
            rows += bytes((r, g, b, 255))
    raw = zlib.compress(bytes(rows), 9)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) +
           _chunk(b"IDAT", raw) + _chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    write_png(os.path.join(OUT, "icon-192.png"), 192)
    write_png(os.path.join(OUT, "icon-512.png"), 512)
    # maskable: thicker ring kept well inside the safe zone
    write_png(os.path.join(OUT, "icon-maskable-512.png"), 512,
              ring_outer=0.30, ring_inner=0.21)
