# Draws the app icons (no image libraries on this phone, so plain PNG writing). Run: python3 scripts/make_icons.py
import zlib, struct, math

def png(path, size, maskable=False):
    rows = []
    cx = size / 2
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            u, v = (x + .5) / size, (y + .5) / size
            # background: deep navy with a warm glow in the middle
            d = math.hypot(u - .5, v - .5)
            r, g, b = 11, 16, 32
            glow = max(0, 1 - d / .62)
            r, g, b = int(r + 200 * glow * glow), int(g + 60 * glow * glow), int(b + 10 * glow * glow)
            # a fist-ish rounded block and four finger bars (upper area)
            inset = 0.0 if maskable else 0.0
            def rrect(x0, y0, x1, y1, rad):
                px = min(max(u, x0 + rad), x1 - rad); py = min(max(v, y0 + rad), y1 - rad)
                return math.hypot(u - px, v - py) <= rad
            if rrect(.27, .46, .73, .76, .09) or any(rrect(.27 + i * .1175, .22 + abs(i - 1.5) * .04, .27 + i * .1175 + .092, .52, .046) for i in range(4)) or rrect(.66, .44, .82, .56, .05):
                r, g, b = 255, 244, 224
            row += bytes((r, g, b, 255))
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

png('icons/icon-192.png', 192)
png('icons/icon-512.png', 512)
png('icons/maskable-512.png', 512, True)
