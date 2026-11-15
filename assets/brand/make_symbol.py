"""Builds the refreshed Trail symbol as one closed SVG path.

The outer edge is a fixed circle; the stroke grows from a thin tail to a round
head (the 2026-11-15 refresh: thicker tail, wider gap). Defaults = shipped mark.

Run: python3 make_symbol.py <tag> [key=value ...]  -> writes sym-<tag>.svg (black)
"""
import math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

P = dict(
    head_deg=-45,     # head position (screen degrees, y down; -45 = top right)
    sweep=322,        # how far the stroke runs; 360 - sweep = the gap
    r_base=86,        # centreline radius of the ring
    lift=0,           # how far the head moves outward
    lift_from=0.80,   # where along the stroke the lift starts (0..1)
    w_tail=26,        # stroke width at the tail
    w_head=52,        # stroke width at the head
    w_power=1,        # how late the width grows
    steps=12,         # Bezier segments per side
    outer=108,         # >0: keep the outer edge a fixed circle of this radius (the original Trail build)
    ball=0,           # extra head ball radius (0 = none)
    ball_out=0,       # how far the ball centre sits outside the centreline
)


def smooth(a, b, x):
    t = min(1, max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def centre(s, p):
    th = math.radians(p["head_deg"] - p["sweep"] * (1 - s))
    r = p["r_base"] + p["lift"] * smooth(p["lift_from"], 1, s)
    w = p["w_tail"] + (p["w_head"] - p["w_tail"]) * s ** p["w_power"]
    if p["outer"]:
        r = p["outer"] - w / 2
    return th, r, w


def edge(s, p, side):
    th, r, w = centre(s, p)
    rr = r + side * w / 2
    return (rr * math.cos(th), rr * math.sin(th))


def deriv(s, p, side, e=1e-4):
    lo, hi = max(0, s - e), min(1, s + e)
    a, b = edge(lo, p, side), edge(hi, p, side)
    return ((b[0] - a[0]) / (hi - lo), (b[1] - a[1]) / (hi - lo))


def build(p):
    n, pts = p["steps"], []

    def curve(side, s_from, s_to):
        out, h = [], (s_to - s_from) / n
        for i in range(n):
            s0, s1 = s_from + i * h, s_from + (i + 1) * h
            p0, p1 = edge(s0, p, side), edge(s1, p, side)
            d0, d1 = deriv(s0, p, side), deriv(s1, p, side)
            out.append(((p0[0] + d0[0] * h / 3, p0[1] + d0[1] * h / 3),
                        (p1[0] - d1[0] * h / 3, p1[1] - d1[1] * h / 3), p1))
            pts.extend([p0, p1])
        return out

    outer, inner = curve(+1, 0, 1), curve(-1, 1, 0)
    w0, w1 = centre(0, p)[2], centre(1, p)[2]
    for s in (0, 1):  # caps
        th, r, w = centre(s, p)
        for k in range(36):
            a = 2 * math.pi * k / 36
            pts.append((r * math.cos(th) + w / 2 * math.cos(a), r * math.sin(th) + w / 2 * math.sin(a)))

    if p['ball']:
        th, r, _ = centre(1, p)
        for kk in range(36):
            a = 2 * math.pi * kk / 36
            pts.append(((r + p['ball_out']) * math.cos(th) + p['ball'] * math.cos(a), (r + p['ball_out']) * math.sin(th) + p['ball'] * math.sin(a)))
    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
    k = 216 / max(max(xs) - min(xs), max(ys) - min(ys))
    ox = 128 - k * (min(xs) + max(xs)) / 2
    oy = 128 - k * (min(ys) + max(ys)) / 2 - 1.5  # optical centre, a hair above
    T = lambda q: f"{ox + k * q[0]:.2f} {oy + k * q[1]:.2f}"

    start = edge(0, p, +1)
    d = [f"M{T(start)}"]
    d += [f"C{T(a)} {T(b)} {T(c)}" for a, b, c in outer]
    d.append(f"A{k * w1 / 2:.2f} {k * w1 / 2:.2f} 0 0 1 {T(edge(1, p, -1))}")
    d += [f"C{T(a)} {T(b)} {T(c)}" for a, b, c in inner]
    d.append(f"A{k * w0 / 2:.2f} {k * w0 / 2:.2f} 0 0 1 {T(start)}Z")
    if p["ball"]:  # same winding as the stroke, so nonzero fill unions them
        th, r, _ = centre(1, p)
        cx, cy, br = (r + p["ball_out"]) * math.cos(th), (r + p["ball_out"]) * math.sin(th), p["ball"]
        a, b = (cx + br, cy), (cx - br, cy)
        R = f"{k * br:.2f}"
        d.append(f"M{T(a)}A{R} {R} 0 1 1 {T(b)}A{R} {R} 0 1 1 {T(a)}Z")
    return "".join(d)


def svg(d, fill):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img">'
            f'<title>Orbit</title><path fill="{fill}" d="{d}"/></svg>\n')


if __name__ == "__main__":
    tag = sys.argv[1] if len(sys.argv) > 1 else "v1"
    p = dict(P)
    for kv in sys.argv[2:]:
        key, val = kv.split("=")
        p[key] = float(val) if "." in val else int(val)
    d = build(p)
    with open(os.path.join(HERE, f"sym-{tag}.svg"), "w") as f:
        f.write(svg(d, "#000000"))
    print("ok", tag)
