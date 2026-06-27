#!/usr/bin/env python3
"""Generate a properly formatted PRD.docx using only the Python stdlib (zipfile).
A .docx is an OOXML package: a zip of XML parts. We hand-build the parts we need.
"""
import zipfile
from xml.sax.saxutils import escape

ACCENT = "1F7A5A"      # deep green
ACCENT_LT = "E3F0EB"   # light green (table header / shading)
MUTED = "5A6B63"
RULE = "C9D6CF"

# ---------- low-level run / paragraph builders ----------

def run(text, *, bold=False, italic=False, color=None, size=None, font=None):
    rpr = "<w:rPr>"
    if bold: rpr += "<w:b/>"
    if italic: rpr += "<w:i/>"
    if color: rpr += f'<w:color w:val="{color}"/>'
    if size: rpr += f'<w:sz w:val="{size*2}"/><w:szCs w:val="{size*2}"/>'
    if font: rpr += f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}"/>'
    rpr += "</w:rPr>"
    # support inline emphasis tokens already split by caller; here text is plain
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'

def runs_from_segments(segments):
    """segments: list of (text, fmt-dict)."""
    return "".join(run(t, **f) for t, f in segments)

def para(content_runs, *, style=None, spacing_before=0, spacing_after=120,
         shading=None, keep=False):
    ppr = "<w:pPr>"
    if style: ppr += f'<w:pStyle w:val="{style}"/>'
    if shading: ppr += f'<w:shd w:val="clear" w:color="auto" w:fill="{shading}"/>'
    if keep: ppr += "<w:keepNext/>"
    ppr += f'<w:spacing w:before="{spacing_before}" w:after="{spacing_after}"/>'
    ppr += "</w:pPr>"
    return f"<w:p>{ppr}{content_runs}</w:p>"

def heading(text, level=1):
    style = f"Heading{level}"
    color = ACCENT
    size = 18 if level == 1 else 14
    return para(run(text, bold=True, color=color, size=size, font="Calibri"),
                style=style, spacing_before=240, spacing_after=120, keep=True)

def title(text, subtitle=None):
    out = para(run(text, bold=True, color=ACCENT, size=30, font="Calibri Light"),
               spacing_before=0, spacing_after=40)
    if subtitle:
        out += para(run(subtitle, italic=True, color=MUTED, size=12),
                    spacing_after=160)
    return out

def normal(segments, **kw):
    if isinstance(segments, str):
        segments = [(segments, {})]
    return para(runs_from_segments(segments), **kw)

def bullet(segments, level=0):
    if isinstance(segments, str):
        segments = [(segments, {})]
    ppr = ('<w:pPr><w:pStyle w:val="ListBullet"/>'
           f'<w:numPr><w:ilvl w:val="{level}"/><w:numId w:val="1"/></w:numPr>'
           '<w:spacing w:after="60"/></w:pPr>')
    return f"<w:p>{ppr}{runs_from_segments(segments)}</w:p>"

def hrule():
    return ('<w:p><w:pPr><w:pBdr>'
            f'<w:bottom w:val="single" w:sz="6" w:space="6" w:color="{RULE}"/>'
            '</w:pBdr><w:spacing w:after="160"/></w:pPr></w:p>')

# ---------- table builder ----------

def _cell(segments, *, header=False, width=None, fill=None):
    fill = fill or (ACCENT_LT if header else None)
    tcpr = "<w:tcPr>"
    if width: tcpr += f'<w:tcW w:w="{width}" w:type="dxa"/>'
    if fill: tcpr += f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>'
    tcpr += '<w:vAlign w:val="center"/></w:tcPr>'
    if isinstance(segments, str):
        segments = [(segments, {})]
    if header:
        segments = [(t, {**f, "bold": True, "color": ACCENT}) for t, f in segments]
    body = runs_from_segments(segments)
    ppr = '<w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>'
    return f"<w:tc>{tcpr}<w:p>{ppr}{body}</w:p></w:tc>"

def table(rows, widths=None):
    n = len(rows[0])
    widths = widths or [int(9360 / n)] * n
    grid = "<w:tblGrid>" + "".join(f'<w:gridCol w:w="{w}"/>' for w in widths) + "</w:tblGrid>"
    border = f'w:val="single" w:sz="4" w:space="0" w:color="{RULE}"'
    borders = ("<w:tblBorders>"
               f'<w:top {border}/><w:left {border}/><w:bottom {border}/>'
               f'<w:right {border}/><w:insideH {border}/><w:insideV {border}/>'
               "</w:tblBorders>")
    tblpr = ('<w:tblPr><w:tblW w:w="9360" w:type="dxa"/>'
             '<w:tblLayout w:type="fixed"/>' + borders +
             '<w:tblCellMar>'
             '<w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>'
             '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/>'
             '</w:tblCellMar></w:tblPr>')
    body = ""
    for i, row in enumerate(rows):
        is_h = (i == 0)
        trpr = '<w:trPr><w:tblHeader/></w:trPr>' if is_h else ''
        cells = "".join(_cell(c, header=is_h, width=widths[j]) for j, c in enumerate(row))
        body += f"<w:tr>{trpr}{cells}</w:tr>"
    spacer = '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>'
    return f"<w:tbl>{tblpr}{grid}{body}</w:tbl>{spacer}"

# ---------- document content ----------

B = lambda t: (t, {"bold": True})
N = lambda t: (t, {})
I = lambda t: (t, {"italic": True})

body = []
A = body.append

A(title("Cetele — Product Requirements (v1)",
        "A group dhikr tracker that makes daily remembrance addictive — built around the "
        "traditional cetele (a shared tally where a group splits and completes a collective "
        "dhikr goal together)."))
A(hrule())

A(heading("1. The bet", 1))
A(normal([N("People don't quit dhikr because they don't want to — they quit because "),
          B("nothing pulls them back daily"),
          N(". Cetele combines two forces:")]))
A(table([
    ["Layer", "What it does", "Why it works"],
    [[B("Dopamine (the hook)")], "Tap counter, progress rings, streaks, live group counter, surprise milestones", "Gets people opening the app every day"],
    [[B("Accountability (the glue)")], "Real groups, visible peers, leaderboard, forgiveness", 'Stops the "streak broke → quit forever" collapse'],
], widths=[2200, 4000, 3160]))
A(normal([I("Dhikr is repetitive habit-maintenance, not skill mastery — the exact use case where "
            "gamification works. We lean in, but anchor it in real group accountability so it lasts.")],
         shading=ACCENT_LT, spacing_after=80))
A(hrule())

A(heading("2. Users & roles", 1))
A(normal("Drive-style group ownership (D26). There is no app-level admin tier. Anyone can create a group and becomes its owner; groups are private by default and visible only to people in them. An owner can share a group with others as a co-admin, and can transfer ownership. Roles are per-group (a person can be owner of one circle, co-admin of another, member of a third):"))
A(table([
    ["Role", "Scope", "Can do"],
    [[B("Member")], "one group", "Log tasks, see own streak + the group's activity, leaderboard & garden"],
    [[B("Co-admin")], "one group", "Everything a member can + edit the group's task list & targets, invite/remove members, promote members, re-share the group, and log counts on a member's behalf (attributed + audited — the in-person halaqah tally; D29)"],
    [[B("Owner")], "one group", "Everything a co-admin can + delete the group and transfer ownership (one owner per group; the creator, until transferred)"],
], widths=[1900, 1500, 5960]))
A(normal("There is no global \"see every group\" view — access is bounded entirely by ownership and sharing."))
A(normal("Succession (D27). So a single owner leaving never orphans a circle, a co-admin can claim ownership of a group whose owner is dormant (no activity >= 14 days) or gone. Forgiveness-framed, not a power grab."))
A(normal("Super-admin (D27, backend-only). One out-of-band role exists for maintainability + safety: users.is_super_admin, grantable only directly in Supabase (no in-app UI; cannot be self-escalated). Its powers are limited to recovery (reassign a dead group's owner) and moderation (act on abuse reports) — not a browse-all-content god view, so the privacy promise above holds. Every super-admin action is written to an audit_log. This keeps the project maintainable without the original operator (hand the flag to a successor in Supabase)."))
A(hrule())

A(heading("3. The core loop", 1))
for step in [
    "Open app → see group + own progress (rings unfilled, \"Day 12 streak\")",
    "Tap-count dhikr → ring fills → group total ticks up live",
    "Hit target → ring closes → confetti / surprise reward",
    "Streak +1 → climb leaderboard",
    "(later) push notification next day → repeat",
]:
    A(bullet(step))
A(hrule())

A(heading("4. Features", 1))
A(heading("v1 — ship first (\"Social v1\")", 2))
for t in [
    ("Auth", "Google OAuth + email magic link (Supabase Auth)"),
    ("Groups", "create, join via invite link/code, admins manage members"),
    ("Admin-set dhikr list", "admin defines items + daily target counts per group (e.g. Allahu Akbar ×100, Astaghfirullah ×1000)"),
    ("Tap counter", "tasbih-style: tap to count, haptics + subtle sound, number animation"),
    ("Progress rings", "Apple-Watch-style ring per item, fills toward target, closes on completion"),
    ("Live collective counter", "real-time group total (\"41,300 / 100,000 today\") via Supabase Realtime"),
    ("Streaks", "personal daily streak; \"never miss twice\" forgiveness (1 streak-freeze)"),
    ("Group leaderboard", "rank members by consistency/completion this week"),
    ("Consistency tracker", "how steadfast each member is over time (the North Star, made visible in-app): a 14-day task-by-task grid (each task x day, green intensity = % of that day's target hit) + a headline 30-day consistency band (a calm word + %, abstracted — \"Steady · 83%\" — not a raw 7/30/90 grade; D28) + longest streak. Three views — personal (self-reflection; members can correct their own past counts in the grid), group-admin oversight (every member's 30-day consistency, to spot who's slipping — tapping a member opens a per-task fortnight breakdown, each task x the last 14 days with exact count vs target, so an admin can ask about specific days; forgiveness-framed; admins may also log on the member's behalf, every proxy entry attributed and audited — D29 — plus a 'log for the group' quick action for the in-person halaqah), and group collective rollup (the group's 90-day figure, shown to all). Distinct from streaks (momentum) and the leaderboard (this-week rank): the pattern over time. Derived from logs vs targets; forgiveness-framed, no FOMO."),
    ("Variable-reward milestones", "occasional surprise animation / du'a at random milestones"),
]:
    A(bullet([B(t[0] + " — "), N(t[1])]))
A(heading("v1.1 — fast-follow", 2))
A(bullet([B("Push notifications — "), N("daily nudges via Web Push + service worker (VAPID keys), sent from a Vercel cron / Supabase Edge Function. Works on Android & desktop; iOS only on 16.4+ as an installed PWA")]))
A(bullet([B("Email reminders — "), N("reliable fallback (Supabase/Resend) for users who don't install or are on older iOS")]))
A(bullet([B("Custom daily reminders (D30) — "), N("each member sets a per-task reminder time (their own clock time, toggle on/off), not a fixed prayer anchor — flexibility over rigid habit-stacking. The in-app timing UI ships now; delivery rides the Web Push / email above. Prayer-time quick-fill presets can layer on later as an optional shortcut.")]))
A(heading("v2 — retention deepening (research-backed)", 2))
A(normal([N("From research/03-feature-recommendations.md (links the motivation science in research/02 to the competitive gaps in research/01). Top priority is to promote two already-scoped items: variable-reward milestones (v1) and reminders + habit-stacking (v1.1).")]))
for t in [
    ("Group garden (collective living artefact)", "a shared garden per circle that grows as the group completes its rings and goes calmly dormant (never shaming) when activity drops. The emotional/identity layer Cetele lacks — built on the group, not a solo avatar, so it reinforces accountability; jannah/garden imagery suits a worship app. Optional personal “your corner” plant. Levers: ownership + relatedness; precedent: Finch / Forest."),
    ("One-tap peer reactions", "send a quick dua / “barakAllahu feek” / heart when a peer closes their rings. Near-zero-effort relatedness spark. Precedent: Strava kudos."),
    ("Fresh-start re-engagement", "re-invite lapsed members on temporal landmarks (Hijri new month, Ramadan, week start) with a clean-slate framing. Lever: fresh-start effect."),
    ("Achievement badges", "streak landmarks (7 / 30 / 100 days) + monthly awards; earned and escalating, never saturating. Precedent: Apple Fitness awards."),
    ("Endowed-progress onboarding", "new members/groups start visibly “part-way” so day one feels like momentum, not a cold start. Lever: endowed-progress effect."),
    ("Winnable sub-group / pair goals", "shared goals for two friends or a sub-group instead of one whole-group ranking, keeping competition winnable and intrinsic."),
]:
    A(bullet([B(t[0] + " — "), N(t[1])]))
A(heading("Later / maybe", 2))
A(bullet("Multiple groups per user · weekly group goals · history/stats charts · Ramadan mode · audio dhikr · levels/XP · avatar & theme customisation"))
A(hrule())

A(heading("5. Retention mechanics (where each lever lives)", 1))
A(table([
    ["Lever", "Source", "Implementation"],
    ["Completion drive", "dopamine", "Progress rings + confetti"],
    ["Variable reward", "dopamine", "Surprise milestone reveals"],
    ["Social proof", "accountability", "Live group counter + leaderboard"],
    ["Identity", "durable", "\"You're someone who does dhikr daily\" framing"],
    ["Steadfastness", "durable", "Consistency tracker — 14-day grid + 30-day band (personal/admin) + 90-day group rollup"],
    ["Forgiveness", "durable", "Never-miss-twice + streak freeze"],
    ["Real accountability", "durable", "Visible group peers (the cetele itself)"],
    ["Trigger", "dopamine", "(v1.1) Daily reminders — member-set custom per-task times (D30)"],
    ["Ownership", "durable", "(v2) Group garden — a collective artefact that grows with the group"],
    ["Peer encouragement", "accountability", "(v2) One-tap dua / kudos reactions on a peer's completion"],
    ["Re-engagement", "durable", "(v2) Fresh-start prompts (Hijri new month, Ramadan, week start)"],
], widths=[2600, 2200, 4560]))
A(hrule())

A(heading("6. Data model (sketch)", 1))
for t in [
    ("users", "id, name, avatar (Supabase Auth). No app-level admin flag; one out-of-band is_super_admin (D27, granted only in Supabase — recovery + moderation)."),
    ("groups", "id, name, invite_code, created_by = the owner (authoritative; updated on transfer / succession)"),
    ("memberships", "user_id, group_id, role (owner | admin | member); exactly one owner row per group"),
    ("invites", "id, group_id, email, role (admin | member), code — outstanding share-by-email invites (accept → a membership)"),
    ("tasks", "id, group_id, label, subtitle, target_count, order"),
    ("logs", "id, user_id, task_id, count, date, logged_by (nullable — the admin who logged it on the member's behalf; null = self; D29)"),
    ("reminders", "user_id, task_id, time (HH:MM), on — personal per-task custom reminder times (D30)"),
    ("streaks", "user_id, current, longest, freezes_left, last_active"),
    ("push_subscriptions", "user_id, endpoint, keys (for Web Push; see §4 v1.1)"),
    ("reports", "id, reporter_id, group_id/target, reason, status (D27 moderation queue)"),
    ("audit_log", "id, actor_id, action, target, at — every super-admin action is recorded (D27)"),
]:
    A(bullet([B(t[0] + " — "), N(t[1])]))
A(normal([I("Row-Level Security on every table (D26 ownership): a row is visible only to people in that group (owner / co-admin / member); writes to group config require owner or admin; delete group and transfer ownership require owner. Succession (D27): a co-admin may claim ownership when the owner is dormant (no activity >= 14 days) or gone. Super-admin (D27): the only path that bypasses ownership — limited to recovery (reassign a dead group's owner) + moderation; no read access to group content; every action audited.")],
         spacing_before=60))
A(normal([B("Consistency tracker"), N(" needs no new table — derived from logs (count per user / item / date) vs each item's target_count: a day's completion % = closed rings ÷ total tasks; the 30-day band (personal/admin) = % of the last 30 days fully completed, the 90-day rollup aggregates across members (the North Star). 7-day and personal 90-day windows were dropped (D28). Admin proxy-logging (D29) writes logs.logged_by, each proxy edit backed by an audit_log row. Optionally precompute a daily_completion materialized view (user_id, group_id, date, pct) for scale.")],
         spacing_before=60))
A(hrule())

A(heading("7. Tech stack", 1))
A(table([
    ["Concern", "Choice"],
    ["Framework", [B("Next.js (App Router) + React + TypeScript")]],
    ["UI", "Tailwind + shadcn/ui"],
    ["Backend / DB / Auth / Realtime", [B("Supabase"), N(" (Postgres, Auth, Realtime)")]],
    ["Hosting", [B("Vercel")]],
    ["Delivery", [B("Installable PWA"), N(" (no app store — works on any phone via browser)")]],
    ["Tracking", [B("Linear"), N(" (team CET)")]],
], widths=[3400, 5960]))
A(hrule())

A(heading("8. Explicitly out of scope (v1)", 1))
A(normal("Native iOS/Android apps · payments · multiple languages · in-app messaging/chat · "
         "web-only desktop-first design (we are mobile-first)."))
A(hrule())

A(heading("9. Success = retention, not signups", 1))
A(table([
    ["Metric", "Target"],
    [[B("D7 retention")], "members active 7 days after joining"],
    [[B("Daily completion rate")], "% of members closing all rings"],
    [[B("Streak survival")], "% keeping a 14-day+ streak"],
    [[B("Group liveness")], "groups with daily collective activity"],
], widths=[3400, 5960]))
A(normal([B("North star: "), N("70%+ consistency across a group over 90 days — showing up, not perfection.")],
         shading=ACCENT_LT, spacing_before=40))
A(normal([N("The consistency tracker (§4) is the in-app surface for these metrics — what's measured for success is also what members and admins see, so the product and the goal stay aligned.")],
         spacing_before=40))

document_body = "".join(body)

# ---------- package parts ----------

DOCUMENT = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>{document_body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
</w:sectPr></w:body></w:document>'''

STYLES = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
<w:pPr><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:b/><w:color w:val="{ACCENT}"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
<w:pPr><w:outlineLvl w:val="1"/></w:pPr>
<w:rPr><w:b/><w:color w:val="{ACCENT}"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/>
<w:basedOn w:val="Normal"/></w:style>
</w:styles>'''

NUMBERING = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0">
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/>
<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#9702;"/>
<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>'''

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>'''

RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

DOC_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>'''

import os
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "PRD.docx")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", CONTENT_TYPES)
    z.writestr("_rels/.rels", RELS)
    z.writestr("word/document.xml", DOCUMENT)
    z.writestr("word/styles.xml", STYLES)
    z.writestr("word/numbering.xml", NUMBERING)
    z.writestr("word/_rels/document.xml.rels", DOC_RELS)
print("wrote", out)
