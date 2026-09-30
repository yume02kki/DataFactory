#!/usr/bin/env python3
"""Generates the icon set (SVG sources + 128px PNGs). Run: python3 icons/generate.py"""
import math, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
F, K = "#8e919b", "#63656b"          # fill, outline
BLUE, GREEN, MINT, SHADE = "#76a9cf", "#88d468", "#68edbd", "#72757e"
SW = 5                                # outline width on the 128px grid


def rr(x, y, w, h, r):
    """Rounded rect as a path (so it can be combined with holes)."""
    return (f"M{x+r} {y}H{x+w-r}A{r} {r} 0 0 1 {x+w} {y+r}V{y+h-r}A{r} {r} 0 0 1 {x+w-r} {y+h}"
            f"H{x+r}A{r} {r} 0 0 1 {x} {y+h-r}V{y+r}A{r} {r} 0 0 1 {x+r} {y}Z")


def rect(x, y, w, h):
    return f"M{x} {y}H{x+w}V{y+h}H{x}Z"


def circ(cx, cy, r):
    return f"M{cx-r} {cy}a{r} {r} 0 1 0 {2*r} 0a{r} {r} 0 1 0 {-2*r} 0Z"


def p(d, **kw):
    attrs = "".join(f' {k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<path d="{d}"{attrs}/>'


def dark(d, w):
    return p(d, fill="none", stroke=K, stroke_width=w)


def light(d, w, color=F, cap="round"):
    return p(d, fill="none", stroke=color, stroke_width=w - 2 * SW, stroke_linecap=cap)


def tube(d, w):
    """An outlined thick line."""
    return dark(d, w) + light(d, w)


def patch(x, y, w, h, color=F):
    return p(rect(x, y, w, h), fill=color, stroke="none")


def chevrons(y, color):
    c = lambda o: p(f"M44 {y+14+o}L64 {y+o}L84 {y+14+o}V{y+28+o}L64 {y+14+o}L44 {y+28+o}Z", fill=color)
    return c(19) + c(0)


def star(cx, cy, ro, ri, n=5, rot=-90):
    pts = []
    for i in range(2 * n):
        a = math.radians(rot + i * 180 / n)
        r = ro if i % 2 == 0 else ri
        pts.append(f"{cx + r*math.cos(a):.1f} {cy + r*math.sin(a):.1f}")
    return "M" + "L".join(pts) + "Z"


def sparkle(cx, cy, r, k=0.18):
    q = r * k
    return (f"M{cx} {cy-r}Q{cx+q} {cy-q} {cx+r} {cy}Q{cx+q} {cy+q} {cx} {cy+r}"
            f"Q{cx-q} {cy+q} {cx-r} {cy}Q{cx-q} {cy-q} {cx} {cy-r}Z")


def scissor_half(flip):
    t = f"translate(64 62) {'scale(-1 1) ' if flip else ''}rotate(32)"
    return (f'<g transform="{t}">'
            + p(circ(0, 46, 20) + circ(0, 46, 8), fill_rule="evenodd")
            + p("M-12 32V-40Q-12 -58 6 -62L12 32Z")
            + patch(-9.5, 20, 19, 15.5) + "</g>")


def arrow_tube(d, head, w=22):
    return dark(d, w) + p(head) + light(d, w)


ICONS = {}

ICONS["analyzer"] = (
    tube("M80 100C100 82 94 58 72 50", 20)
    + '<g transform="translate(58 46) rotate(45)">'
    + p(rr(-15, -40, 30, 12, 5)) + p(rr(-11, -30, 22, 56, 4))
    + p("M-16 26H16A16 16 0 0 1 -16 26Z") + "</g>"
    + p(rr(24, 98, 84, 18, 9)))

ICONS["balancer"] = (
    arrow_tube("M88 116V98C88 70 40 66 40 40V30", "M18 36L40 8L62 36Z")
    + arrow_tube("M40 116V98C40 70 88 66 88 40V30", "M66 36L88 8L110 36Z"))

ICONS["belt"] = p(rr(18, 6, 92, 116, 9)) + "".join(
    p(f"M51 {y+15}L64 {y}L77 {y+15}Z", fill=K) for y in (24, 57, 90))

ICONS["block"] = p(rr(16, 16, 96, 96, 20))

ICONS["comparator"] = p(rr(14, 30, 100, 28, 10)) + p(rr(14, 70, 100, 28, 10))

ICONS["constant_producer"] = (
    chevrons(4, BLUE) + p(rr(31, 59, 66, 64, 9))
    + p("M64 78V104M51 91H77", fill="none", stroke_width=8, stroke_linecap="butt"))

ICONS["constant_signal"] = tube("M10 78H30L43 46L62 104L82 28L96 78H118", 18)

ICONS["cutter"] = (p(rr(60, 12, 8, 11, 2)) + p(rr(60, 29, 8, 11, 2))
                   + scissor_half(False) + scissor_half(True))

ICONS["display"] = (
    p(rect(56, 90, 16, 14)) + p(rr(40, 100, 48, 13, 5)) + patch(58.5, 94, 11, 9)
    + p(rr(12, 16, 104, 80, 12) + rect(29, 33, 70, 44), fill_rule="evenodd"))

ICONS["filter"] = p("M10 12H118L78 62V108L52 120V62Z")

ICONS["goal_acceptor"] = (
    p(rr(31, 5, 66, 64, 9) + rect(47, 21, 34, 32), fill_rule="evenodd")
    + chevrons(77, GREEN))

ICONS["item_producer"] = (
    f'<g fill="{MINT}">'
    + '<g transform="translate(50 78) rotate(-45)">' + p(rr(-48, -9, 92, 18, 3))
    + p("M-24 -9V9", fill="none") + "</g>"
    + p(star(92, 34, 25, 11, rot=-70)) + p(sparkle(36, 28, 17)) + p(sparkle(100, 94, 17))
    + "</g>")

ICONS["lever"] = p(rr(4, 26, 120, 76, 38) + circ(86, 64, 16), fill_rule="evenodd")

ICONS["logic_gate"] = (
    "".join(tube(f"M{c} 16V112", 11) + tube(f"M16 {c}H112", 11) for c in (40, 56, 72, 88))
    + p(rr(27, 27, 74, 74, 10)) + p("M56 46H72L82 56V72L72 82H56L46 72V56Z"))

ICONS["miner"] = p(
    "M38 18H53L64 5L75 18H90A26 26 0 0 1 116 44V92A26 26 0 0 1 90 118H38A26 26 0 0 1 12 92V44A26 26 0 0 1 38 18Z"
    + rr(29, 35, 70, 66, 14), fill_rule="evenodd")

_R, _G, _B = (44, 46), (84, 46), (64, 82)
_c = lambda c, r, fill, extra="": f'<circle cx="{c[0]}" cy="{c[1]}" r="{r}" fill="{fill}" stroke="none"{extra}/>'
ICONS["mixer"] = (
    "<defs>"
    + "".join(f'<clipPath id="{n}"><circle cx="{c[0]}" cy="{c[1]}" r="33"/></clipPath>'
              for n, c in (("r", _R), ("g", _G)))
    + "</defs>"
    + "".join(_c(c, 38, K) for c in (_R, _G, _B))
    + _c(_R, 33, "#ff666a") + _c(_G, 33, "#78ff66") + _c(_B, 33, "#66a7ff")
    + _c(_G, 33, "#ffff66", ' clip-path="url(#r)"')
    + _c(_B, 33, "#dd66ff", ' clip-path="url(#r)"')
    + _c(_B, 33, "#8cfff4", ' clip-path="url(#g)"')
    + '<g clip-path="url(#r)">' + _c(_B, 33, "#ffffff", ' clip-path="url(#g)"') + "</g>")

ICONS["painter"] = (tube("M36 25H18V64H72V86", 16)
                    + p(rr(34, 6, 86, 38, 9)) + p(rr(60, 80, 24, 44, 12)))


def _ray(a, r, cx=64, cy=86):
    return f"{cx + r*math.cos(math.radians(a)):.1f} {cy - r*math.sin(math.radians(a)):.1f}"


ICONS["reader"] = (
    p("M8 86A56 56 0 0 1 120 86H98A34 34 0 0 0 30 86Z")
    + p("".join(f"M{_ray(a, 34)}L{_ray(a, 56)}" for a in (45, 90, 135)), fill="none")
    + p("M64 58C60 68 53 80 53 86A11 11 0 0 0 75 86C75 80 68 68 64 58Z"))

ICONS["rotater"] = arrow_tube("M97.7 92.3A44 44 0 1 1 100 38.8",
                              "M111.5 55.2L115.7 22.9L79.7 48.1Z", 24)

ICONS["stacker"] = "".join(p(f"M64 {y-24}L120 {y}L64 {y+24}L8 {y}Z") for y in (92, 64, 36))

ICONS["storage"] = (p(rr(14, 40, 100, 78, 9) + rr(46, 66, 36, 12, 4), fill_rule="evenodd")
                    + p(rr(8, 12, 112, 32, 8)))

ICONS["transistor"] = (
    p(rr(38, 6, 34, 26, 4)) + p(rr(38, 96, 34, 26, 4)) + tube("M86 76H102V44", 15)
    + p(rr(22, 28, 66, 72, 13)) + p(circ(102, 38, 10))
    + p("M60 48L47 66H63L50 82", fill="none", stroke_width=7))

ICONS["trash"] = (
    tube("M46 30V15H82V30", 14) + p("M24 40H104L98 112Q97 122 88 122H40Q31 122 30 112Z")
    + p(rr(14, 28, 100, 17, 8.5)) + p("M48 60V106M64 60V106M80 60V106", fill="none"))

ICONS["underground_belt"] = p(
    "M34 18H94Q102 18 104 26L122 98Q124 108 114 108H98Q92 108 88 102L64 78L40 102"
    "Q36 108 30 108H14Q4 108 6 98L24 26Q26 18 34 18Z")

ICONS["virtual_processor"] = (
    tube("M64 70V30", 15) + tube("M46 70V56L30 40", 15) + tube("M82 70V56L98 40", 15)
    + p("M14 66H114V84H100L80 104V122H48V104L28 84H14Z")
    + p(circ(64, 22, 14)) + p(circ(28, 36, 13)) + p(circ(100, 36, 13)))

ICONS["wire"] = (
    p(rr(36, 8, 12, 22, 3)) + p(rr(80, 8, 12, 22, 3))
    + tube("M42 56V84A22 22 0 0 0 86 84V56", 17)
    + p(rr(29, 26, 26, 36, 7)) + p(rr(73, 26, 26, 36, 7)))

ICONS["wire_tunnel"] = (p(rr(8, 52, 112, 24, 6)) + patch(38, 54.5, 52, 19, SHADE)
                        + p(rr(52, 8, 24, 112, 6)))


def ell(cx, cy, rx, ry):
    return f"M{cx-rx} {cy}a{rx} {ry} 0 1 0 {2*rx} 0a{rx} {ry} 0 1 0 {-2*rx} 0Z"


# Bucket with the orbit band, after the AWS S3 mark.
ICONS["s3"] = (
    p("M20 34L32 108Q34 120 46 120H82Q94 120 96 108L108 34Z")
    + p("M25 56Q58 84 106 64", fill="none")
    + p(circ(110, 62, 8))
    + p(ell(64, 32, 47, 15)) + p(ell(64, 32, 33, 7), fill=SHADE))

ICONS["db"] = (
    p("M16 28V100A48 16 0 0 0 112 100V28Z")
    + p("M16 52A48 16 0 0 0 112 52M16 76A48 16 0 0 0 112 76", fill="none")
    + p(ell(64, 28, 48, 16)))


def _link(d):
    return (p(d, fill="none", stroke_width=15, stroke_linecap="butt")
            + p(d, fill="none", stroke=F, stroke_width=5, stroke_linecap="butt"))


def _ring(cx, cy, r, hole):
    return p(circ(cx, cy, r) + circ(cx, cy, hole), fill_rule="evenodd")


# The Kafka "K": hub node with four satellite nodes.
ICONS["kafka_topic"] = (
    _link("M46 50V29") + _link("M46 78V99") + _link("M58 57.5L84 43") + _link("M58 70.5L84 85")
    + _ring(46, 64, 19, 8) + _ring(46, 18, 13, 5) + _ring(46, 110, 13, 5)
    + _ring(92, 38, 13, 5) + _ring(92, 90, 13, 5))

# The Flink squirrel.
ICONS["flink"] = (
    p("M58 114C24 118 4 86 14 52C22 24 54 12 66 32C74 46 64 60 52 54C60 70 64 94 58 114Z")
    + p("M60 116C52 94 60 72 80 66C98 62 108 80 104 98C102 108 98 114 94 116Z")
    + p(rr(80, 108, 32, 12, 6))
    + p("M80 34L80 12L96 28Z")
    + p("M70 46C70 34 80 26 92 27C104 28 110 38 120 47C112 58 102 66 90 66C79 66 70 57 70 46Z")
    + p(circ(98, 42, 2.5), fill=K)
    + tube("M82 86H98", 15))


# --- Data engineering products (stylised after each product's mark) and generics ---

def union(*tubes):
    """Several tubes merged into one outlined shape."""
    return "".join(dark(d, w) for d, w in tubes) + "".join(light(d, w) for d, w in tubes)


def ngon(cx, cy, r, n, rot=-90):
    return "M" + "L".join(f"{cx + r*math.cos(math.radians(rot + i*360/n)):.1f} "
                          f"{cy + r*math.sin(math.radians(rot + i*360/n)):.1f}" for i in range(n)) + "Z"


def pt(cx, cy, r, a):
    return f"{cx + r*math.cos(math.radians(a)):.1f} {cy + r*math.sin(math.radians(a)):.1f}"


def ink(d, w=6):
    return p(d, fill="none", stroke_width=w)


def dot(cx, cy, r):
    return p(circ(cx, cy, r), fill=K, stroke="none")


ICONS["rabbitmq"] = p("M16 12H38V46H56V12H78V46H112V116H16Z" + rect(78, 74, 16, 16), fill_rule="evenodd")

ICONS["kong"] = (p("M60 14H78L87 29L75 43L56 25Z") + p("M77 50L89 36L122 100V114H98L92 100H73L62 85Z")
                 + p("M46 60L57 47L67 59L30 114H6V104Z") + p("M45 100H66L72 114H37Z"))

ICONS["postgres"] = (
    p(circ(28, 50, 22)) + p(circ(100, 50, 22)) + dark("M64 70V98Q64 114 82 110", 24)
    + p(rr(34, 12, 60, 74, 30)) + light("M64 70V98Q64 114 82 110", 24)
    + dot(51, 46, 4) + dot(77, 46, 4))

ICONS["mysql"] = (
    p("M54 38L60 12L80 34Z")
    + p("M8 92C14 56 46 30 82 30C98 30 110 38 122 48C110 50 104 54 100 60C90 56 80 56 72 58"
        "C52 62 40 78 34 100C30 108 28 116 30 122C22 118 18 110 18 102C14 100 10 96 8 92Z")
    + p("M60 60C62 72 70 80 82 82C78 72 76 64 72 58Z")
    + dot(98, 44, 3))


def _slab(y):
    return p(f"M8 {y}L64 {y-22}L120 {y}V{y+12}L64 {y+34}L8 {y+12}Z") + ink(f"M8 {y}L64 {y+22}L120 {y}", SW)


ICONS["redis"] = (_slab(84) + _slab(58) + _slab(32)
                  + p(star(46, 30, 8, 3.5), fill=K, stroke="none") + p(ell(78, 34, 9, 4), fill=K, stroke="none"))

ICONS["mongodb"] = (ink("M64 96V122", 7) + p("M64 6C92 34 96 78 64 106C32 78 36 34 64 6Z")
                    + ink("M64 40V104", SW))

ICONS["elasticsearch"] = (p("M16 44A52 52 0 0 1 112 44Z") + p("M16 84A52 52 0 0 0 112 84Z")
                          + p(rr(6, 52, 80, 24, 12)) + p(rr(92, 52, 30, 24, 12)))

_sf = []
for _a in range(0, 360, 60):
    _tip = pt(64, 64, 38, _a).split()
    _sf.append((f"M64 64L{pt(64, 64, 54, _a)}", 15))
    _sf.append((f"M{pt(64, 64, 54, _a - 22)}L{pt(64, 64, 36, _a)}L{pt(64, 64, 54, _a + 22)}", 15))
ICONS["snowflake"] = union(*_sf)

_band = lambda y: p(f"M10 {y}L64 {y+26}L118 {y}V{y+14}L64 {y+40}L10 {y+14}Z")
ICONS["databricks"] = p("M64 8L118 34L64 60L10 34Z") + _band(50) + _band(78)

ICONS["airflow"] = "".join(
    f'<g transform="rotate({a} 64 64)">' + p("M64 64C60 40 74 16 106 8C108 40 92 60 64 64Z") + "</g>"
    for a in (0, 90, 180, 270)) + dot(64, 64, 4)

ICONS["spark"] = p(star(64, 68, 58, 23, rot=-90))

ICONS["docker"] = (
    p("M6 66H102C106 54 116 52 124 58C122 68 114 74 106 74C100 100 80 114 54 114C26 114 10 96 6 66Z")
    + "".join(p(rr(x, y, 13, 13, 2)) for x, y in
              [(20, 48), (37, 48), (54, 48), (71, 48), (88, 48), (37, 31), (54, 31), (71, 31), (71, 14)]))

ICONS["kubernetes"] = (
    p(ngon(64, 66, 58, 7))
    + ink("".join(f"M{pt(64, 66, 8, -90 + i*360/7)}L{pt(64, 66, 42, -90 + i*360/7)}" for i in range(7)), 6)
    + p(circ(64, 66, 25), fill="none", stroke_width=6) + dot(64, 66, 8))

ICONS["nginx"] = p(ngon(64, 64, 59, 6)) + ink("M45 88V40L83 88V40", 11)

ICONS["grafana"] = (p(star(64, 64, 58, 47, n=11)) + ink("M90 64A26 26 0 1 1 80 44M90 64H66", 10))

ICONS["prometheus"] = (
    p(circ(64, 64, 55))
    + p("M64 18C64 34 84 44 84 66H44C44 56 50 52 52 44C56 48 58 50 58 54C60 42 60 30 64 18Z", fill=K, stroke_width=2)
    + p(rr(42, 73, 44, 9, 2), fill=K, stroke="none") + p(rr(50, 88, 28, 10, 5), fill=K, stroke="none"))

ICONS["dbt"] = union(("M28 28L100 100", 36), ("M100 28L28 100", 36)) + dot(64, 64, 8)

ICONS["clickhouse"] = ("".join(p(rr(x, 14, 15, 100, 3)) for x in (8, 30, 52, 74))
                       + p(rr(98, 50, 15, 28, 3), fill=SHADE))

ICONS["cassandra"] = (p("M6 64Q64 6 122 64Q64 122 6 64Z") + p(circ(64, 64, 23), fill=SHADE) + dot(64, 64, 9))

ICONS["bigquery"] = (
    p(ngon(64, 64, 59, 6, rot=0)) + p(circ(60, 60, 23), fill="none", stroke_width=7)
    + ink("M77 77L94 94", 10) + ink("M51 66V58M60 70V48M69 66V55", 6))

ICONS["lambda"] = union(("M28 20H48L92 108H104", 20), ("M56 60L28 108", 20))

ICONS["iceberg"] = (p("M22 60H106L94 94L70 120L44 106L28 84Z", fill=BLUE)
                    + p("M38 56L58 12L74 30L92 56Z") + tube("M10 58H118", 13))

ICONS["delta_lake"] = p("M64 8L122 114H6Z" + "M64 50L88 94H40Z", fill_rule="evenodd")

ICONS["terraform"] = (p("M12 6L44 24V60L12 42Z") + p("M48 26L80 44V80L48 62Z")
                      + p("M84 44L116 26V62L84 80Z") + p("M48 66L80 84V120L48 102Z"))

ICONS["git"] = ('<g transform="rotate(45 64 64)">' + p(rr(22, 22, 84, 84, 11)) + "</g>"
                + ink("M64 36V94M64 46L84 66", 7) + dot(64, 36, 9) + dot(64, 94, 9) + dot(86, 68, 9))

_snake = ("M38 24Q38 10 52 10H74Q88 10 88 24V50Q88 62 76 62H52Q38 62 38 76V86H26"
          "Q10 86 10 72V56Q10 40 26 40H62V34H38Z")
ICONS["python"] = (p(_snake) + dot(51, 23, 4.5)
                   + '<g transform="rotate(180 64 64)">' + p(_snake) + dot(51, 23, 4.5) + "</g>")

_plus = lambda cx, cy, a, w: [(f"M{cx} {cy-a}V{cy+a}", w), (f"M{cx-a} {cy}H{cx+a}", w)]
ICONS["tableau"] = union(*(
    _plus(64, 64, 24, 13)
    + sum((_plus(x, y, 12, 12) for x in (28, 100) for y in (28, 100)), [])
    + sum((_plus(x, y, 7, 11) for x, y in ((64, 14), (64, 114), (14, 64), (114, 64))), [])))

ICONS["superset"] = tube("M64 64C50 38 12 40 12 64C12 88 50 90 64 64C78 38 116 40 116 64C116 88 78 90 64 64Z", 21)

ICONS["duckdb"] = p(circ(64, 64, 56) + circ(50, 64, 20) + rr(80, 56, 26, 16, 8), fill_rule="evenodd")

ICONS["neo4j"] = (_link("M52 44L92 32") + _link("M46 56L92 98")
                  + p(circ(40, 46, 26)) + p(circ(100, 30, 15)) + p(circ(96, 100, 18)))

_gq = [pt(64, 64, 46, -90 + i*60) for i in range(6)]
ICONS["graphql"] = (union(("M" + "L".join(_gq) + "Z", 13), (f"M{_gq[0]}L{_gq[2]}L{_gq[4]}Z", 13))
                    + "".join(p(circ(*map(float, q.split()), 10)) for q in _gq))

ICONS["vault"] = p("M6 14H122L64 120Z") + "".join(
    dot(x, y, 5.5) for x, y in ((46, 36), (64, 36), (82, 36), (55, 53), (73, 53), (64, 70)))

ICONS["jupyter"] = (p("M20 42A48 48 0 0 1 108 42A62 30 0 0 0 20 42Z") + p("M20 86A48 48 0 0 0 108 86A62 30 0 0 1 20 86Z")
                    + p(circ(108, 14, 7)) + p(circ(20, 112, 9)) + p(circ(16, 18, 5)))

ICONS["pandas"] = (
    p(rr(38, 28, 17, 32, 2)) + p(rr(38, 66, 17, 15, 2), fill=SHADE) + p(rr(38, 87, 17, 32, 2))
    + p(rr(73, 8, 17, 32, 2)) + p(rr(73, 46, 17, 15, 2), fill=SHADE) + p(rr(73, 67, 17, 32, 2)))

ICONS["cloud"] = p("M34 104A25 25 0 0 1 30 54A32 32 0 0 1 92 46A29 29 0 0 1 96 104Z")

ICONS["server"] = "".join(
    p(rr(12, y, 104, 30, 8)) + dot(30, y + 15, 5) + ink(f"M74 {y+15}H100", 6) for y in (10, 49, 88))

ICONS["table"] = (p(rr(10, 16, 108, 96, 9)) + patch(12.5, 18.5, 103, 23, SHADE)
                  + ink("M10 44H118M10 67H118M10 90H118M46 44V112M82 44V112", SW)
                  + p(rr(10, 16, 108, 96, 9), fill="none"))

ICONS["scheduler"] = p(circ(64, 64, 55)) + ink("M64 30V64L86 78", 8)

ICONS["api"] = union(("M48 14Q32 14 32 30V48Q32 64 18 64Q32 64 32 80V98Q32 114 48 114", 17),
                     ("M80 14Q96 14 96 30V48Q96 64 110 64Q96 64 96 80V98Q96 114 80 114", 17))

ICONS["file"] = (p("M24 8H76L104 36V120H24Z") + ink("M76 8V36H104", SW)
                 + ink("M40 60H88M40 78H88M40 96H72", 6))


def main():
    os.makedirs(f"{HERE}/svg", exist_ok=True)
    for name, body in ICONS.items():
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">'
               f'<g fill="{F}" stroke="{K}" stroke-width="{SW}" stroke-linejoin="round" stroke-linecap="round">'
               f'{body}</g></svg>\n')
        path = f"{HERE}/svg/{name}.svg"
        with open(path, "w") as f:
            f.write(svg)
        subprocess.run(["rsvg-convert", "-w", "128", "-h", "128", path, "-o", f"{HERE}/{name}.png"], check=True)
    print(f"wrote {len(ICONS)} icons")


if __name__ == "__main__":
    main()
