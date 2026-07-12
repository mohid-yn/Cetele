#!/usr/bin/env python3
"""Generate the "Turning on reminders" setup deck (iPhone + Android) as a .pptx,
using only the Python stdlib — same trick as scripts/build_prd_docx.py: an OOXML
package is a zip of XML parts, so we hand-build the parts we need.

The deck IS the content — edit the SLIDES list below, then re-run:

    python3 scripts/build_push_guide_pptx.py [output.pptx]

Default output is the Windows Downloads folder when running under WSL.
"""
import os
import sys
import zipfile
from xml.sax.saxutils import escape

# Brand tokens (app/globals.css) — emerald + gold on warm cream (D20/D25).
EMERALD = "047857"
GOLD = "F59E0B"
CREAM = "FAF6EC"
INK = "1C1814"
MUTED = "5A5248"
WHITE = "FFFFFF"

EMU_W, EMU_H = 12192000, 6858000  # 16:9

# ---------------------------------------------------------------------------
# Content
# ---------------------------------------------------------------------------

TITLE = "Turning on reminders"
SUBTITLE = "Cetele · iPhone + Android · about 2 minutes"

SLIDES = [
    (
        "What you're setting up",
        [
            "A nudge at a time YOU choose — set per task, not one blanket alarm.",
            "It arrives even when the app is closed and the phone is locked.",
            "If you've already finished a task today, it stays quiet. No nagging.",
            "You can turn it off any time, per task or for the whole device.",
        ],
        "Reminders are per device. Turn them on wherever you want to be nudged.",
    ),
    (
        "iPhone — the one catch",
        [
            "On iPhone, notifications only work if Cetele is added to the Home Screen.",
            "This is Apple's rule for web apps, not a Cetele limitation.",
            "In a normal Safari tab, iOS gives the app no way to notify you at all.",
            "So: install it first (next slide), then turn reminders on.",
        ],
        "Requires iOS 16.4 or later. If Cetele shows install instructions instead of a switch, this is why.",
    ),
    (
        "iPhone — step by step",
        [
            "1. Open Cetele in Safari (it must be Safari, not Chrome).",
            "2. Tap the Share button — the square with the arrow pointing up.",
            "3. Scroll down and tap 'Add to Home Screen', then 'Add'.",
            "4. Close Safari. Open Cetele from the new Home Screen icon.",
            "5. Go to Profile → Reminders → 'Turn on'.",
            "6. Tap 'Allow' when iPhone asks about notifications.",
        ],
        "Step 4 matters: opening it from the Home Screen icon is what makes notifications possible.",
    ),
    (
        "Android — step by step",
        [
            "1. Open Cetele in Chrome.",
            "2. Go to Profile → Reminders → 'Turn on'.",
            "3. Tap 'Allow' when Chrome asks about notifications.",
            "That's it — no install needed.",
            "Optional: Chrome menu (⋮) → 'Add to Home screen' for an app icon.",
        ],
        "Android delivers notifications from a browser tab, so the install is a convenience, not a requirement.",
    ),
    (
        "Set your times",
        [
            "Profile → Reminders lists every task in your circles.",
            "Tap the time box on a task and pick when you want the nudge.",
            "Flip the switch on for the tasks you want reminders for.",
            "Each task is independent — remind me for Salawat at 7:45am, nothing else.",
        ],
        "Times are in your own timezone, detected automatically.",
    ),
    (
        "Prove it works",
        [
            "In Profile → Reminders, tap 'Test'.",
            "Immediately lock your phone and put it down.",
            "About 10 seconds later, the notification should appear.",
            "Tapping it should open Cetele.",
        ],
        "Locking the phone is the point — a notification that only shows while you're staring at the screen proves nothing.",
    ),
    (
        "If nothing arrives",
        [
            "iPhone: did you open Cetele from the HOME SCREEN icon, not a Safari tab?",
            "Check the phone allowed notifications: Settings → Cetele → Notifications.",
            "Focus / Do Not Disturb will hold notifications back silently.",
            "Reinstalled the app, or tapped 'Don't allow' once? Turn reminders off, then on again.",
            "Still nothing? Tell Mohid — the server logs whether the push was sent.",
        ],
        "A notification permission you denied once will not be asked for again — you have to re-allow it in phone settings.",
    ),
]

# ---------------------------------------------------------------------------
# XML builders
# ---------------------------------------------------------------------------


def _txbody(paras):
    return f'<p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>{"".join(paras)}</p:txBody>'


def _para(text, *, size, bold=False, color=INK, bullet=False, space_after=600):
    """One paragraph. Sizes are in points; OOXML wants hundredths."""
    b = "1" if bold else "0"
    marker = (
        f'<a:buClr><a:srgbClr val="{EMERALD}"/></a:buClr>'
        f'<a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>'
        if bullet
        else "<a:buNone/>"
    )
    indent = ' marL="342900" indent="-342900"' if bullet else ' marL="0" indent="0"'
    return (
        f'<a:p><a:pPr{indent}><a:spcAft><a:spcPts val="{space_after}"/></a:spcAft>{marker}</a:pPr>'
        f'<a:r><a:rPr lang="en-US" sz="{int(size * 100)}" b="{b}" dirty="0">'
        f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
        f'<a:latin typeface="Segoe UI"/></a:rPr>'
        f"<a:t>{escape(text)}</a:t></a:r></a:p>"
    )


def _shape(sid, name, x, y, cx, cy, txbody, *, fill=None, line=None):
    fill_xml = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else "<a:noFill/>"
    line_xml = (
        f'<a:ln w="28575"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>'
        if line
        else ""
    )
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{escape(name)}"/>'
        f"<p:cNvSpPr/><p:nvPr/></p:nvSpPr>"
        f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
        f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>{fill_xml}{line_xml}</p:spPr>'
        f"{txbody}</p:sp>"
    )


def _slide(shapes):
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        "<p:cSld><p:spTree>"
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
        '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
        f"{''.join(shapes)}"
        "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"
    )


def title_slide():
    """Emerald cover — the brand's calm surface, gold reserved for the accent rule."""
    bg = _shape(2, "bg", 0, 0, EMU_W, EMU_H, _txbody([]), fill=EMERALD)
    rule = _shape(3, "rule", 838200, 3000000, 1200000, 60000, _txbody([]), fill=GOLD)
    title = _shape(
        4,
        "title",
        838200,
        2000000,
        9000000,
        900000,
        _txbody([_para(TITLE, size=54, bold=True, color=WHITE, space_after=0)]),
    )
    sub = _shape(
        5,
        "subtitle",
        838200,
        3300000,
        9000000,
        700000,
        _txbody([_para(SUBTITLE, size=20, color=CREAM, space_after=0)]),
    )
    return _slide([bg, rule, title, sub])


def content_slide(idx, heading, bullets, note):
    bg = _shape(2, "bg", 0, 0, EMU_W, EMU_H, _txbody([]), fill=CREAM)
    rule = _shape(3, "rule", 838200, 1250000, 700000, 45000, _txbody([]), fill=GOLD)
    head = _shape(
        4,
        "heading",
        838200,
        500000,
        10000000,
        700000,
        _txbody([_para(heading, size=36, bold=True, color=EMERALD, space_after=0)]),
    )
    body = _shape(
        5,
        "body",
        838200,
        1600000,
        10500000,
        3300000,
        _txbody([_para(b, size=20, bullet=True) for b in bullets]),
    )
    # The note is the thing people miss — give it its own card, not fine print.
    note_card = _shape(
        6,
        "note",
        838200,
        5200000,
        10500000,
        900000,
        _txbody([_para(note, size=15, color=MUTED, space_after=0)]),
        fill=WHITE,
        line=GOLD,
    )
    page = _shape(
        7,
        "pageno",
        11200000,
        6200000,
        400000,
        300000,
        _txbody([_para(str(idx), size=12, color=MUTED, space_after=0)]),
    )
    return _slide([bg, rule, head, body, note_card, page])


# ---------------------------------------------------------------------------
# Package scaffolding (the minimum PowerPoint will open)
# ---------------------------------------------------------------------------

RELS_ROOT = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
    "</Relationships>"
)

THEME = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Cetele">'
    "<a:themeElements>"
    '<a:clrScheme name="Cetele"><a:dk1><a:srgbClr val="1C1814"/></a:dk1><a:lt1><a:srgbClr val="FAF6EC"/></a:lt1>'
    '<a:dk2><a:srgbClr val="047857"/></a:dk2><a:lt2><a:srgbClr val="FFFFFF"/></a:lt2>'
    '<a:accent1><a:srgbClr val="047857"/></a:accent1><a:accent2><a:srgbClr val="F59E0B"/></a:accent2>'
    '<a:accent3><a:srgbClr val="10B981"/></a:accent3><a:accent4><a:srgbClr val="EA580C"/></a:accent4>'
    '<a:accent5><a:srgbClr val="5A5248"/></a:accent5><a:accent6><a:srgbClr val="C9C1B3"/></a:accent6>'
    '<a:hlink><a:srgbClr val="047857"/></a:hlink><a:folHlink><a:srgbClr val="5A5248"/></a:folHlink></a:clrScheme>'
    '<a:fontScheme name="Cetele"><a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
    '<a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
    '<a:fmtScheme name="Cetele">'
    "<a:fillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>"
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
    '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
    '<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
    '<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
    "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>"
    "<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>"
    "<a:bgFillStyleLst><a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>"
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>'
    "</a:fmtScheme></a:themeElements></a:theme>"
)

BLANK_TREE = (
    "<p:cSld><p:spTree>"
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    "</p:spTree></p:cSld>"
)

SLIDE_MASTER = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
    f"{BLANK_TREE}"
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" '
    'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
    "</p:sldMaster>"
)

SLIDE_LAYOUT = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">'
    f"{BLANK_TREE}"
    "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>"
)


def build(path):
    slides = [title_slide()] + [
        content_slide(i + 1, h, b, n) for i, (h, b, n) in enumerate(SLIDES)
    ]
    n = len(slides)

    pres_rels = [
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
        f'<Relationship Id="rId{n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>',
    ]
    sld_ids = []
    for i in range(n):
        rid = f"rId{i + 2}"
        pres_rels.append(
            f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i + 1}.xml"/>'
        )
        sld_ids.append(f'<p:sldId id="{256 + i}" r:id="{rid}"/>')

    presentation = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        f"<p:sldIdLst>{''.join(sld_ids)}</p:sldIdLst>"
        f'<p:sldSz cx="{EMU_W}" cy="{EMU_H}"/><p:notesSz cx="{EMU_H}" cy="{EMU_W}"/>'
        "</p:presentation>"
    )

    overrides = "".join(
        f'<Override PartName="/ppt/slides/slide{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(n)
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
        f"{overrides}</Types>"
    )

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", RELS_ROOT)
        z.writestr("ppt/presentation.xml", presentation)
        z.writestr(
            "ppt/_rels/presentation.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f"{''.join(pres_rels)}</Relationships>",
        )
        z.writestr("ppt/theme/theme1.xml", THEME)
        z.writestr("ppt/slideMasters/slideMaster1.xml", SLIDE_MASTER)
        z.writestr(
            "ppt/slideMasters/_rels/slideMaster1.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'
            "</Relationships>",
        )
        z.writestr("ppt/slideLayouts/slideLayout1.xml", SLIDE_LAYOUT)
        z.writestr(
            "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
            "</Relationships>",
        )
        for i, xml in enumerate(slides):
            z.writestr(f"ppt/slides/slide{i + 1}.xml", xml)
            z.writestr(
                f"ppt/slides/_rels/slide{i + 1}.xml.rels",
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
                "</Relationships>",
            )
    return n


def default_out():
    """Windows Downloads when running under WSL, else ~/Downloads."""
    for base in ("/mnt/c/Users",):
        if os.path.isdir(base):
            user = os.environ.get("WIN_USER") or "Mohid"
            candidate = os.path.join(base, user, "Downloads")
            if os.path.isdir(candidate):
                return os.path.join(candidate, "Cetele-Reminders-Setup.pptx")
    return os.path.expanduser("~/Downloads/Cetele-Reminders-Setup.pptx")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else default_out()
    count = build(out)
    print(f"Wrote {out} ({count} slides)")
