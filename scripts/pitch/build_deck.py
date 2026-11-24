# Builds the pitch deck from the official template. Expects base.pptx (template + 2 duplicated slides) and img/*.png next to this script.
# Usage: python build_deck.py out.pptx
import copy, sys, os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree

SC = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(SC, "img")
OUT = sys.argv[1]

ORANGE, NAVY, BLUE, RUST, GREY = "FD9B36", "1B1F6B", "2A5BC8", "C2410C", "6B6459"
INK, WHITE, CREAM = "111111", "FFFFFF", "F8F2E4"
GREEN, RED, AMBER = "2E7D32", "C62828", "B45309"
TINT_O, TINT_B, TINT_G, TINT_R = "FFF1E0", "E8ECFB", "E6F2E8", "FDE8E8"

prs = Presentation(os.path.join(SC, "base.pptx"))
S = list(prs.slides)

def rgb(h): return RGBColor.from_string(h)

def shadow(sp, color=ORANGE, alpha=55, blur=0, dist=4):
    spPr = sp._element.spPr
    eff = etree.SubElement(spPr, qn("a:effectLst"))
    sh = etree.SubElement(eff, qn("a:outerShdw"), blurRad=str(int(Pt(blur))), dist=str(int(Pt(dist))), dir="2700000", algn="tl", rotWithShape="0")
    c = etree.SubElement(sh, qn("a:srgbClr"), val=color)
    etree.SubElement(c, qn("a:alpha"), val=str(alpha * 1000))

def box(sl, x, y, w, h, fill=WHITE, line=INK, lw=1.5, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.08, shd=True, name=None):
    s = sl.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = radius
    if fill is None: s.fill.background()
    else:
        s.fill.solid(); s.fill.fore_color.rgb = rgb(fill)
    if line is None: s.line.fill.background()
    else:
        s.line.color.rgb = rgb(line); s.line.width = Pt(lw)
    if shd: shadow(s)
    if name: s.name = name
    s.text_frame.text = ""
    return s

def para_fill(tf, paras, size, color, align, font, spc):
    first = True
    for p in paras:
        if isinstance(p, str): p = [(p, {})]
        elif isinstance(p, tuple): p = [p]
        para = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        para.alignment = align
        if spc: para.space_after = Pt(spc)
        for t, o in p:
            r = para.add_run(); r.text = t
            f = r.font; f.size = Pt(o.get("size", size)); f.bold = o.get("b", False); f.italic = o.get("i", False)
            f.name = o.get("font", font); f.color.rgb = rgb(o.get("color", color))

def text(sl, x, y, w, h, paras, size=12, color=INK, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, font="Calibri", spc=0, margin=0.04, name=None):
    tb = sl.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame; tf.word_wrap = True
    for side in ("left", "right", "top", "bottom"):
        setattr(tf, "margin_" + side, Inches(margin))
    tf.vertical_anchor = anchor
    para_fill(tf, paras, size, color, align, font, spc)
    if name: tb.name = name
    return tb

def shape_text(s, paras, size=11, color=INK, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font="Calibri", margin=0.05, spc=0):
    tf = s.text_frame; tf.word_wrap = True
    for side in ("left", "right", "top", "bottom"):
        setattr(tf, "margin_" + side, Inches(margin))
    tf.vertical_anchor = anchor
    para_fill(tf, paras, size, color, align, font, spc)
    return s

def chip(sl, x, y, label, w=None, fill=RUST):
    w = w or (0.2 + 0.075 * len(label))
    s = box(sl, x, y, w, 0.27, fill=fill, line=None, radius=0.5, shd=False)
    shape_text(s, [(label, {"b": True})], size=9.5, color=WHITE, margin=0.02)
    return s

def arrow(sl, x1, y1, x2, y2, color=NAVY, w=1.75, both=False, dash=False):
    c = sl.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = rgb(color); c.line.width = Pt(w)
    ln = c.line._get_or_add_ln()
    if dash:
        etree.SubElement(ln, qn("a:prstDash"), val="dash")
    if both: etree.SubElement(ln, qn("a:headEnd"), type="triangle", w="med", len="med")
    etree.SubElement(ln, qn("a:tailEnd"), type="triangle", w="med", len="med")
    return c

def icon(sl, x, y, d, emoji, fill=ORANGE, size=None):
    s = sl.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(d), Inches(d))
    s.fill.solid(); s.fill.fore_color.rgb = rgb(fill); s.line.fill.background()
    shape_text(s, [(emoji, {"font": "Segoe UI Emoji"})], size=size or d * 26, color=WHITE, margin=0)
    return s

def set_sub(sl, t):
    for sh in sl.shapes:
        if sh.is_placeholder and sh.placeholder_format.idx == 1:
            r = sh.text_frame.paragraphs[0].runs[0]; r.text = t

def strip_include(sl):
    for sh in list(sl.shapes):
        if sh.has_text_frame and (sh.text_frame.text.startswith("INCLUDE") or sh.text_frame.text.startswith(("What the", "Solution in", "Frontend", "Step-by", "Your USP", "Impact:", "Target"))):
            sh._element.getparent().remove(sh._element)

def set_title(sl, t):
    sl.shapes.title.text_frame.paragraphs[0].runs[0].text = t

def table(sl, x, y, w, h, data, colw, size=10.5, head_fill=NAVY, zebra=("FFFFFF", "FBF6EC"), first_bold=True, rowh=None):
    rows, cols = len(data), len(data[0])
    gs = sl.shapes.add_table(rows, cols, Inches(x), Inches(y), Inches(w), Inches(h))
    tbl = gs.table
    tblPr = tbl._tbl.tblPr
    for k in ("bandRow", "firstRow"): tblPr.set(k, "0")
    st = tblPr.find(qn("a:tableStyleId"))
    if st is not None: st.text = "{5940675A-B579-460E-94D1-54222C63F5DA}"  # No style, table grid
    for i, cw in enumerate(colw): tbl.columns[i].width = Inches(cw)
    for r in range(rows):
        if rowh: tbl.rows[r].height = Inches(rowh[r] if isinstance(rowh, list) else rowh)
        for c in range(cols):
            cell = tbl.cell(r, c)
            val = data[r][c]
            cell.margin_left = cell.margin_right = Inches(0.06)
            cell.margin_top = cell.margin_bottom = Inches(0.025)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            tf = cell.text_frame; tf.word_wrap = True
            opts = {}
            if isinstance(val, tuple): val, opts = val
            p = tf.paragraphs[0]; p.text = ""
            rr = p.add_run(); rr.text = val
            f = rr.font; f.name = "Calibri"; f.size = Pt(opts.get("size", size))
            if r == 0:
                f.bold = True; f.color.rgb = rgb(WHITE)
                cell.fill.solid(); cell.fill.fore_color.rgb = rgb(opts.get("fill", head_fill))
            else:
                f.bold = opts.get("b", first_bold and c == 0)
                f.color.rgb = rgb(opts.get("color", INK))
                cell.fill.solid(); cell.fill.fore_color.rgb = rgb(opts.get("fill", zebra[r % 2]))
            p.alignment = opts.get("align", PP_ALIGN.LEFT)
    return gs

# ---------- footer (layout) ----------
for lay in prs.slide_layouts:
    for sh in lay.shapes:
        if sh.has_text_frame and ("<Team Name>" in sh.text_frame.text or "<Team ID>" in sh.text_frame.text):
            for p in sh.text_frame.paragraphs:
                for r in p.runs:
                    r.text = r.text.replace("<Team Name>", "SantaClaude").replace("<Team ID>", "6e091a28")

# =====================================================================
# SLIDE 1 — Title
# =====================================================================
s1 = S[0]
vals = {"TEAM NAME:": "SantaClaude", "COLLEGE NAME:": "M S Ramaiah Institute of Technology", "TRACK:": "Track 01 · Make MCP Matter", "TEAM ID:": "6e091a28"}
for sh in s1.shapes:
    if sh.has_text_frame and sh.text_frame.text.strip() in vals:
        p = sh.text_frame.paragraphs[0]
        base = p.runs[0]
        v = vals[sh.text_frame.text.strip()]
        if v:
            r = p.add_run(); r.text = "  " + v
            r.font.size = base.font.size; r.font.name = "Calibri"; r.font.bold = False
            r.font.color.rgb = rgb(NAVY)
    if sh.has_text_frame and sh.text_frame.text.startswith("Member 1"):
        names = ["Shourya Chouhan", "Shreya Singh Chouhan", "Daksh Bhatt", "Devansh Jain"]
        for p, n in zip(sh.text_frame.paragraphs, names):
            base = p.runs[0]
            r = p.add_run(); r.text = "  " + n; r.font.size = base.font.size; r.font.name = "Calibri"; r.font.bold = False; r.font.color.rgb = rgb(NAVY)
    if sh.has_text_frame and sh.text_frame.text.startswith("USN:"):
        usns = ["1MS25CS185", "1MS25CS187", "1MS25CI037", "1MS25CS050"]
        for p, n in zip(sh.text_frame.paragraphs, usns):
            base = p.runs[0]
            r = p.add_run(); r.text = "  " + n; r.font.size = base.font.size; r.font.name = "Calibri"; r.font.bold = False; r.font.color.rgb = rgb(NAVY)

b = box(s1, 8.45, 1.42, 4.3, 1.12, name="Project badge")
text(s1, 8.65, 1.5, 4.0, 0.25, [("OUR PROJECT", {"b": True, "color": RUST})], size=10)
text(s1, 8.65, 1.72, 4.0, 0.5, [[("Kaise", {"color": NAVY}), ("Ho", {"color": ORANGE})]], size=26, font="Arial Black")
text(s1, 8.65, 2.18, 4.0, 0.3, [("powered by Ek Call · a phone-native MCP agent engine", {"color": GREY, "i": True})], size=11)
text(s1, 7.7, 6.25, 5.25, 0.95, [("“One call a day. Peace of mind for the whole family.”", {"i": True, "color": NAVY, "b": True}),
                                 ("AI check-in calls for elderly parents · any phone · their language", {"size": 11, "color": GREY})],
     size=14, font="Cambria", align=PP_ALIGN.RIGHT)
s1.notes_slide.notes_text_frame.text = ("Team SantaClaude, MSRIT. Track 01: Make MCP Matter. Project: KaiseHo, powered by Ek Call. "
    "KaiseHo makes a short, consented AI check-in call to elderly parents every day, in their own language, on any phone, and keeps their children truly informed.")

# =====================================================================
# SLIDE 2 — Problem Statement
# =====================================================================
s = S[1]; strip_include(s)
set_sub(s, "Clearly define the problem you've chosen within your track.")
# ① one line
box(s, 0.7, 2.62, 11.95, 0.78)
chip(s, 0.85, 2.48, "① THE PROBLEM IN ONE LINE")
text(s, 0.9, 2.74, 11.6, 0.62, [[("Elderly parents in India are ageing alone while their children work in other cities, and the weekly ", {}),
    ("“all fine, beta”", {"b": True, "i": True, "color": RUST}),
    (" call hides missed medicines, slow decline, loneliness and scam calls until something goes wrong.", {})]], size=14, anchor=MSO_ANCHOR.MIDDLE)
# ② ③ stats
chip(s, 0.85, 3.55, "② WHO IT AFFECTS & HOW MANY   ·   ③ WHY IT MATTERS")
stats = [("22%", "of elderly live alone or with only a spouse; children migrating for work is the #1 reason", "BKBPAI survey, 9,852 elderly", NAVY),
         ("33.7%", "of elderly are on 5+ medicines; 28 in 100 at risk of potentially inappropriate medication", "6-city door-to-door study", BLUE),
         ("₹22,495 cr", "lost to cyber fraud in 2025; digital-arrest scams (mostly targeting elderly) ≈ 9%", "NCRP data, 28 lakh+ cases", RUST),
         ("250–300M", "Indians still use keypad phones: smartphone apps simply cannot reach them", "TelecomTalk", GREEN)]
for i, (big, desc, src, col) in enumerate(stats):
    x = 0.7 + i * 3.02
    box(s, x, 3.75, 2.87, 1.42)
    text(s, x + 0.12, 3.8, 2.65, 0.5, [(big, {"b": True, "color": col})], size=24, font="Arial Black")
    text(s, x + 0.12, 4.3, 2.65, 0.62, [desc], size=10.5)
    text(s, x + 0.12, 4.9, 2.65, 0.22, [(src, {"i": True, "color": GREY})], size=8.5)
# 4 invisible risks
box(s, 0.7, 5.42, 5.55, 1.45)
chip(s, 0.85, 5.28, "THE 4 INVISIBLE RISKS BEHIND “ALL FINE”", fill=NAVY)
risks = [("💊", "Missed\nmedicines", BLUE), ("📉", "Slow health\ndecline", AMBER), ("😔", "Loneliness", GREY), ("🚨", "Scam\ncalls", RED)]
for i, (e, t, col) in enumerate(risks):
    x = 0.95 + i * 1.32
    icon(s, x + 0.25, 5.62, 0.55, e, fill=col, size=16)
    text(s, x - 0.05, 6.2, 1.15, 0.6, [t], size=10.5, align=PP_ALIGN.CENTER)
# ④ existing solutions
box(s, 6.45, 5.42, 6.2, 1.45)
chip(s, 6.6, 5.28, "④ EXISTING SOLUTIONS & THEIR GAPS")
gaps = [("Elder-care apps", "need a smartphone, English, and daily app use"),
        ("Wearables / trackers", "need devices; dashboards that nobody reads"),
        ("Care-manager call centres", "expensive, don't scale to small towns"),
        ("The weekly family call", "irregular, a “performance”, captures no data")]
for i, (a, g) in enumerate(gaps):
    text(s, 6.6, 5.6 + i * 0.31, 5.95, 0.3, [[("✗ ", {"b": True, "color": RED}), (a + ": ", {"b": True}), (g, {"color": GREY})]], size=11)
s.notes_slide.notes_text_frame.text = ("Problem: split families. 22% of elderly live alone or with only a spouse, and children's migration is the biggest reason. "
    "The weekly call is a performance: 'all fine, beta'. Behind it are four invisible risks: missed medicines (a third are on polypharmacy), slow decline, loneliness, and scams (digital-arrest scams were about 9% of 2025's ₹22,495 crore cyber losses). "
    "Apps assume a smartphone and English; 250–300 million Indians still use keypad phones. Children want to know and to call more; they just don't know when or what's wrong.")

# =====================================================================
# SLIDE 3 — Proposed Solution
# =====================================================================
s = S[2]; strip_include(s)
set_sub(s, "Explain what you're building and how it solves the problem.")
box(s, 0.7, 2.62, 11.95, 0.8)
chip(s, 0.85, 2.48, "① SOLUTION IN ONE LINE")
text(s, 0.9, 2.74, 11.6, 0.65, [[("KaiseHo", {"b": True, "color": NAVY}), (" makes a ", {}), ("2-minute, consented AI check-in call", {"b": True}),
    (" to elderly parents every day, in their language, on any phone, and turns it into nudges, alerts and answers for their children. ", {}),
    ("It doesn't replace your call. It improves it.", {"b": True, "i": True, "color": RUST})]], size=14, anchor=MSO_ANCHOR.MIDDLE)
# ② key features
box(s, 0.7, 3.68, 7.75, 1.72)
chip(s, 0.85, 3.54, "② KEY FEATURES")
feats = [("📞", "Daily check-in call", "Kannada · Hindi · English", NAVY), ("💊", "Medicines by name", "logs adherence, refills", BLUE),
         ("🧠", "Remembers & follows up", "“Is your knee better?”", GREEN), ("🛡️", "Scam Shield", "catches scripts live", RED),
         ("🚑", "Emergency cascade", "112 + family + neighbour", RUST), ("💡", "Family nudges", "when to call, what to ask", ORANGE),
         ("✉️", "Family ↔ parent messages", "delivered in the next call", BLUE), ("🤖", "Ask Claude via MCP", "“How was Amma this week?”", NAVY)]
for i, (e, t, d, col) in enumerate(feats):
    cx = 0.85 + (i % 4) * 1.9; cy = 3.82 + (i // 4) * 0.78
    icon(s, cx, cy + 0.04, 0.42, e, fill=col, size=12)
    text(s, cx + 0.47, cy, 1.43, 0.72, [(t, {"b": True, "size": 10.5}), (d, {"color": GREY, "size": 9})], size=10)
# ③ user flow
box(s, 0.7, 5.62, 7.75, 1.25)
chip(s, 0.85, 5.48, "③ USER FLOW")
flow = [("1", "Consent call", "parent says yes, picks time & what's shared"), ("2", "Daily 2-min call", "AI voice agent on her basic phone"),
        ("3", "MCP tools log", "meds, mood, memory, scam check"), ("4", "Post-call brain", "summary, trends, flags in 30 s"),
        ("5", "Child acts", "nudge, alert, Claude answers")]
for i, (n, t, d) in enumerate(flow):
    x = 0.85 + i * 1.53
    bx = box(s, x, 5.82, 1.3, 0.95, fill=[TINT_O, TINT_B, TINT_B, TINT_B, TINT_G][i], line=None, shd=False)
    text(s, x + 0.04, 5.84, 1.22, 0.92, [(n + ". " + t, {"b": True, "size": 10.5, "color": NAVY}), (d, {"size": 9, "color": INK})], size=10)
    if i < 4: arrow(s, x + 1.32, 6.29, x + 1.51, 6.29, color=ORANGE, w=2)
# ④ MVP
box(s, 8.65, 3.68, 4.0, 3.19, fill=WHITE)
chip(s, 8.8, 3.54, "④ WHAT WE BUILD IN 24 HRS (MVP)")
mvp = ["Real outbound call to a phone (ElevenLabs + Twilio)",
       "MCP server: /mcp/agent (13 tools) + /mcp/family (Claude)",
       "Context builder: meds, follow-ups, messages, weather",
       "Scam Shield (rules + LLM) → Telegram alert in < 10 s",
       "Post-call pipeline: redaction, summary, nudges",
       "Emergency cascade + briefing call to the son",
       "Family dashboard + Live Ops screen (real-time)",
       "Control layer: risk tiers, PII redaction, audit log"]
text(s, 8.8, 3.86, 3.75, 2.95, [[("✓ ", {"b": True, "color": GREEN}), (m, {})] for m in mvp], size=11, spc=9)
s.notes_slide.notes_text_frame.text = ("Solution: KaiseHo, a 2-minute daily AI check-in call in the parent's own language on any phone. Persona: Lakshmi Amma, 68, Mysuru, BP and diabetes; son Ravi in Bengaluru. "
    "Features: daily call, medicines by name, memory and follow-ups, Scam Shield, emergency cascade, family nudges and conversation starters, family messages, and Claude via MCP. "
    "Flow: consent call, daily call, MCP tools log everything, post-call intelligence, child gets a nudge/alert or asks Claude. In 24 hours we build the MVP on the right.")

# =====================================================================
# SLIDE 4 — Tech Stack
# =====================================================================
s = S[3]; strip_include(s)
set_sub(s, "Tools you'll use and how they fit together to deliver the solution.")
chip(s, 0.85, 2.5, "① FRONTEND · BACKEND · DATABASE · AI/ML · CLOUD · APIs")
chip(s, 5.55, 2.5, "② WHY WE PICKED EACH")
chip(s, 7.55, 2.5, "③ TOOLS / LIBRARIES / APIs USED")
rows = [["Layer", "Tools / libraries / APIs", "Why we picked it"],
        ["🎙️ Voice AI", "ElevenLabs Agents (multilingual, Flash v2.5 TTS), post-call analysis, TTS for weekly audio digests", "Natural Kannada/Hindi voices, low latency, native MCP tool support; 70%+ of its India calls are in Indian languages"],
        ["☎️ Telephony", "Twilio (native ElevenLabs integration) → Exotel Indian numbers (roadmap)", "Rings ANY phone, keypad phones included; parent installs nothing"],
        ["🔌 MCP layer", "@modelcontextprotocol/sdk (TypeScript), Streamable HTTP, zod validation", "One server, two doors: the voice agent and Claude share the same tools and rules"],
        ["⚙️ Backend", "Node 20 + TypeScript, Hono, SSE live events, Vitest", "Typed and fast; one process for MCP + REST + webhooks; tool p95 < 400 ms"],
        ["🗄️ Database", "AWS DynamoDB (ap-south-1 Mumbai), S3 for digests, MemoryRepo for local demo", "Serverless, scales per family, encrypted at rest; data stays in India"],
        ["🧠 AI / ML", "AWS Bedrock LLM (insight pass, scam classifier, starters, digest scripts) + deterministic scam rules", "Managed models inside AWS; rules give a < 5 ms score, LLM adds nuance (1.5 s timeout)"],
        ["☁️ Cloud", "EventBridge Scheduler, Lambda, App Runner, Secrets Manager, CloudWatch", "Timezone-aware daily calls, retries and reminders without servers to babysit"],
        ["🖥️ Frontend + APIs", "Next.js, Tailwind, shadcn/ui, Recharts · Telegram Bot API · Claude (MCP client) · Open-Meteo", "Families already live in Telegram; Claude gives a chat door; weather for heat-care tips"]]
table(s, 0.7, 2.86, 11.95, 3.95, rows, [1.75, 4.9, 5.3], size=10.5, rowh=[0.36] + [0.445] * 8)
s.notes_slide.notes_text_frame.text = ("Voice: ElevenLabs Agents with multilingual voices; telephony via Twilio's native integration. "
    "The heart is our MCP server in TypeScript using the official SDK, Streamable HTTP and zod. Backend Node + Hono. Data in DynamoDB in Mumbai; Bedrock for the post-call insight pass and scam classifier; "
    "EventBridge Scheduler + Lambda place daily calls. Families use a Next.js dashboard, Telegram, and Claude through the MCP family endpoint.")

# =====================================================================
# SLIDE 5 — Architecture
# =====================================================================
s = S[4]; strip_include(s)
set_sub(s, "Visually show how your solution works step-by-step and how its technical components are connected.")
# process flow strip
chip(s, 0.85, 2.47, "① STEP-BY-STEP: INPUT → PROCESSING → OUTPUT")
steps = [("INPUT", "Amma talks on her own phone (Kannada / Hindi)", TINT_O, RUST),
         ("PROCESSING", "Voice agent → MCP tools → control layer → post-call AI", TINT_B, NAVY),
         ("OUTPUT", "Nudges · alerts · dashboard · Claude answers", TINT_G, GREEN)]
for i, (h, d, f, c) in enumerate(steps):
    x = 0.7 + i * 4.05
    bx = box(s, x, 2.75, 3.75, 0.48, fill=f, line=c, lw=1.25, shd=False)
    shape_text(bx, [[(h + ":  ", {"b": True, "color": c}), (d, {})]], size=10.5)
    if i < 2: arrow(s, x + 3.77, 2.99, x + 4.03, 2.99, color=ORANGE, w=2.25)
chip(s, 0.85, 3.32, "② ARCHITECTURE  ·  ③ ARROWS = DATA FLOW  ·  ④ EVERY BLOCK LABELLED WITH ITS TECH")
text(s, 7.75, 3.31, 4.9, 0.3, [[("━ ", {"b": True, "color": RUST}), ("MCP tool calls   ", {}), ("━ ", {"b": True, "color": NAVY}), ("APIs / webhooks / voice   ", {}), ("━ ", {"b": True, "color": GREEN}), ("family channels", {})]], size=9.5, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
# zones
def zone(x, y, w, h, label, col):
    z = box(s, x, y, w, h, fill=WHITE, line=col, lw=1.25, shd=False, radius=0.05)
    text(s, x + 0.08, y + 0.04, w - 0.16, 0.22, [(label, {"b": True, "color": col})], size=9)
def node(x, y, w, h, title, sub, fill, line):
    n = box(s, x, y, w, h, fill=fill, line=line, lw=1, shd=False, radius=0.12)
    shape_text(n, [(title, {"b": True, "size": 10}), (sub, {"size": 8.5, "color": GREY})], size=10, margin=0.03)
    return n
Y0 = 3.68
zone(0.7, Y0, 1.6, 3.18, "ELDER SIDE", RUST)
zone(2.48, Y0, 2.5, 3.18, "ELEVENLABS", NAVY)
zone(5.16, Y0, 4.5, 3.18, "AWS · EK CALL ENGINE (ap-south-1)", AMBER)
zone(9.84, Y0, 2.81, 3.18, "FAMILY SIDE", GREEN)
node(0.8, 4.65, 1.4, 1.05, "👵 Amma's phone", "any phone\nno app · no internet", TINT_O, RUST)
node(2.6, 3.98, 2.26, 0.5, "☎️ Twilio telephony", "native integration", TINT_B, NAVY)
node(2.6, 4.7, 2.26, 0.68, "🎙️ KaiseHo voice agent", "multilingual · dynamic variables", TINT_B, NAVY)
node(2.6, 5.55, 2.26, 0.5, "📢 Briefing agent", "calls son / neighbour", TINT_B, NAVY)
node(2.6, 6.2, 2.26, 0.5, "🪝 Post-call webhook", "transcript + analysis (HMAC)", TINT_B, NAVY)
node(5.28, 3.98, 1.95, 0.5, "⏰ EventBridge Scheduler", "daily cron · retries", TINT_O, AMBER)
node(7.58, 3.98, 1.95, 0.5, "λ Lambda start-call", "triggers the call", TINT_O, AMBER)
srv = box(s, 5.28, 4.7, 4.25, 1.05, fill=NAVY, line=None, shd=True, radius=0.1)
shape_text(srv, [("Ek Call Server  (Node + TypeScript + Hono)", {"b": True, "size": 11, "color": WHITE}),
                 ("MCP  /mcp/agent  ·  /mcp/family  ·  REST  ·  SSE", {"size": 9, "color": "FFD9A8"}),
                 ("Control layer: risk tiers · PII redaction · audit · consent", {"size": 9, "color": WHITE})], size=10, margin=0.04)
node(5.28, 6.12, 1.3, 0.58, "🗄️ DynamoDB", "elders, logs, alerts", WHITE, AMBER)
node(6.75, 6.12, 1.3, 0.58, "🧠 Bedrock LLM", "insights · scam AI", WHITE, AMBER)
node(8.23, 6.12, 1.3, 0.58, "🪣 S3", "audio digests", WHITE, AMBER)
node(9.96, 3.98, 2.57, 0.5, "📊 Dashboard + Live Ops", "Next.js · SSE stream", TINT_G, GREEN)
node(9.96, 4.62, 2.57, 0.5, "📱 Telegram alerts", "Bot API · [Ack] [Call]", TINT_G, GREEN)
node(9.96, 5.26, 2.57, 0.5, "🤖 Claude (MCP client)", "“How was Amma?”", TINT_G, GREEN)
node(9.96, 5.9, 2.57, 0.5, "📞 Son's phone", "urgent briefing call", TINT_G, GREEN)
def lab(x, y, t, w=1.0):
    text(s, x, y, w, 0.2, [(t, {"i": True, "color": RUST, "b": True})], size=8, align=PP_ALIGN.CENTER, margin=0)
arrow(s, 2.2, 4.95, 2.6, 4.3, both=True); lab(1.95, 4.42, "voice", 0.6)
arrow(s, 3.73, 4.48, 3.73, 4.7, both=True)
arrow(s, 4.86, 4.92, 5.28, 4.92, color=RUST, w=2.25)
arrow(s, 5.28, 5.18, 4.86, 5.18)
arrow(s, 5.28, 5.55, 4.86, 5.8)
arrow(s, 4.86, 6.45, 5.5, 5.75)
arrow(s, 7.23, 4.23, 7.58, 4.23)
arrow(s, 8.55, 4.48, 8.55, 4.7)
arrow(s, 5.93, 5.75, 5.93, 6.12, both=True)
arrow(s, 7.4, 5.75, 7.4, 6.12, both=True)
arrow(s, 8.88, 5.75, 8.88, 6.12, both=True)
arrow(s, 9.53, 4.78, 9.96, 4.25, color=GREEN, w=2)
arrow(s, 9.53, 5.0, 9.96, 4.87, color=GREEN, w=2)
arrow(s, 9.96, 5.51, 9.53, 5.4, color=GREEN, w=2)
text(s, 9.96, 6.45, 2.57, 0.35, [("☎ rung by the Briefing agent (ElevenLabs)", {"i": True, "color": GREY})], size=8)
s.notes_slide.notes_text_frame.text = ("Input → processing → output. EventBridge Scheduler fires daily, Lambda asks the Ek Call server to start a call; the server builds context (medicines, follow-ups, messages) and calls ElevenLabs' outbound API. "
    "The voice agent talks to Amma over Twilio and calls our MCP tools (/mcp/agent) during the call. After hang-up, a signed webhook delivers the transcript; we redact PII, run the Bedrock insight pass, store summaries in DynamoDB, and fan out alerts to Telegram, the dashboard (SSE) and, if urgent, a briefing call to the son. "
    "Claude connects to /mcp/family: one brain, two doors.")

# =====================================================================
# SLIDE 6 — Novelty
# =====================================================================
s = S[5]; strip_include(s)
set_sub(s, "What makes your idea new compared to what already exists.")
box(s, 0.7, 2.62, 4.85, 4.25)
chip(s, 0.85, 2.48, "① OUR USP  ·  ② NEW COMBINATION")
usp = [("🔌", "One MCP server, two doors", "The voice agent calling Amma and Claude answering Ravi use the same tools and the same rules.", NAVY),
       ("☎️", "Phone-native, zero install", "Works on a keypad phone, in Kannada or Hindi. No app, no internet.", GREEN),
       ("🛡️", "Safety in the server, not the prompt", "Risk tiers T0–T3 enforced in code. No money tool exists.", RUST),
       ("🚨", "Scam Shield mid-conversation", "Catches “digital arrest” scripts and alerts family in seconds.", RED),
       ("❤️", "Success = MORE family calls", "Nudges tell the child when to call and what to ask.", ORANGE)]
for i, (e, t, d, col) in enumerate(usp):
    y = 2.78 + i * 0.7
    icon(s, 0.85, y + 0.05, 0.46, e, fill=col, size=13)
    text(s, 1.4, y, 4.05, 0.68, [(t, {"b": True, "size": 11.5, "color": NAVY}), (d, {"size": 9.5})], size=10)
text(s, 0.85, 6.3, 4.6, 0.5, [[("New combination: ", {"b": True, "color": RUST}), ("ElevenLabs voice agents + MCP + AWS Bedrock + Telegram + Claude, in one engine (Ek Call).", {})]], size=9.5)
chip(s, 5.85, 2.48, "③ COMPETITIVE COMPARISON")
Y, N, P = ("✓", {"color": GREEN, "b": True, "align": PP_ALIGN.CENTER, "size": 13}), ("✗", {"color": RED, "b": True, "align": PP_ALIGN.CENTER, "size": 13}), ("~", {"color": AMBER, "b": True, "align": PP_ALIGN.CENTER, "size": 13})
def K(v): return (v, {"color": GREEN, "b": True, "align": PP_ALIGN.CENTER, "size": 13, "fill": TINT_O})
hdr = ["Capability", ("KaiseHo", {"fill": RUST, "align": PP_ALIGN.CENTER}), ("Elder-care apps", {"align": PP_ALIGN.CENTER}), ("Wearables", {"align": PP_ALIGN.CENTER}), ("Care-manager call centres", {"align": PP_ALIGN.CENTER}), ("IVR reminder calls", {"align": PP_ALIGN.CENTER})]
rows = [hdr,
        ["Works on a keypad phone", K("✓"), N, N, Y, Y],
        ["Natural talk in the parent's language", K("✓"), P, N, Y, N],
        ["Detects scams live, alerts family", K("✓"), N, N, P, N],
        ["Remembers & follows up next day", K("✓"), N, N, P, N],
        ["Tells the child when to call + what to ask", K("✓"), N, N, N, N],
        ["Family can ask an AI (Claude via MCP)", K("✓"), N, N, N, N],
        ["Emergency fan-out (family + neighbour)", K("✓"), P, P, P, N],
        ["Scales cheaply (no humans per call)", K("✓"), Y, P, N, Y]]
table(s, 5.75, 2.82, 6.9, 4.0, rows, [2.55, 0.85, 0.9, 0.85, 0.95, 0.8], size=10, rowh=[0.55] + [0.43] * 8)
s.notes_slide.notes_text_frame.text = ("USP: one MCP server with two very different clients (a voice agent on a phone call and Claude for the child), with server-side risk tiers so both obey the same rules. "
    "It is phone-native, works on keypad phones, and detects scams mid-conversation. Our headline metric is more family calls per week. No existing option combines all of these, as the table shows.")

# =====================================================================
# SLIDE 7 — Impact & Feasibility
# =====================================================================
s = S[6]; strip_include(s)
set_sub(s, "The change your solution creates, and proof it can actually be built.")
# impact
box(s, 0.7, 2.62, 3.85, 4.25)
chip(s, 0.85, 2.48, "① IMPACT")
text(s, 0.85, 2.82, 3.6, 0.95, [("Who benefits", {"b": True, "color": NAVY, "size": 11.5}),
    [("👵 Parents: ", {"b": True}), ("safer, medicines on time, less alone", {})],
    [("👨 Children: ", {"b": True}), ("peace of mind, know when to call", {})],
    [("🩺 Doctors: ", {"b": True}), ("real adherence & symptom history", {})]], size=10.5, spc=1)
text(s, 0.85, 3.85, 3.6, 0.25, [("Measurable outcomes", {"b": True, "color": NAVY})], size=11.5)
kp = [("↑", "family calls / week (headline metric)"), ("%", "medicine adherence per parent"), ("< 10 s", "scam alert to family"), ("< 15 s", "emergency fan-out")]
for i, (k, d) in enumerate(kp):
    y = 4.13 + i * 0.4
    kb = box(s, 0.85, y, 0.85, 0.34, fill=TINT_O, line=None, shd=False, radius=0.3)
    shape_text(kb, [(k, {"b": True, "color": RUST})], size=11, margin=0)
    text(s, 1.78, y, 2.7, 0.34, [d], size=10, anchor=MSO_ANCHOR.MIDDLE)
text(s, 0.85, 5.78, 3.6, 1.05, [("Scalability", {"b": True, "color": NAVY, "size": 11.5}),
    "Serverless per-family design; any language ElevenLabs speaks; Ek Call engine takes new “packs” (hospitals, welfare schemes)."], size=10)
# feasibility
box(s, 4.75, 2.62, 3.75, 4.25)
chip(s, 4.9, 2.48, "② FEASIBILITY")
fz = [("⚙️ Technical", "All building blocks are managed APIs we've tested: ElevenLabs agents with MCP, Twilio, Bedrock, Telegram. Full tool + data spec already written."),
      ("⏱️ Time (24 h)", "Phase 0 MVP tonight → 1: real calls + post-call brain → 2: family MCP + dashboard → 3: emergency, Live Ops, digest → 4: AWS hardening. Feature freeze at hour 20."),
      ("₹ Cost", "₹0 to build tonight; ≈ ₹500–1,500 for the whole event (free tiers + 1 paid month). Running cost ≈ ₹1 per call minute today.")]
y = 2.82
for t, d in fz:
    text(s, 4.9, y, 3.5, 1.3, [(t, {"b": True, "color": NAVY, "size": 11.5}), (d, {"size": 10})], size=10)
    y += 1.33
# risks
box(s, 8.7, 2.62, 3.95, 4.25)
chip(s, 8.85, 2.48, "③ RISKS & HOW WE HANDLE THEM")
rk = [("Kannada speech quality", "test day 1; Hindi/Hinglish fallback"),
      ("Calls flagged as spam", "test Jio/Airtel/Vi; Indian number via Exotel"),
      ("AI gives medical advice", "hard prompt rules + per-call eval checks"),
      ("Privacy discomfort", "consent first, no audio, 24 h deletion, India"),
      ("Latency on calls", "context pushed upfront; tool p95 < 400 ms"),
      ("“Outsourcing love?”", "metric is MORE family calls, not fewer"),
      ("Venue Wi-Fi / demo fails", "server on AWS, hotspot, browser-call backup")]
for i, (r, m) in enumerate(rk):
    text(s, 8.85, 2.82 + i * 0.57, 3.7, 0.55, [[("⚠ " + r, {"b": True, "color": RUST})], [("→ " + m, {})]], size=10)
s.notes_slide.notes_text_frame.text = ("Impact: parents are safer and less alone, children get peace of mind and know when to call, and doctors get real adherence data. We measure family calls per week, adherence, scam-alert time and emergency fan-out time. "
    "Feasibility: everything is built on managed APIs, with a phase-gated 24-hour plan, and it costs nearly nothing to build. Risks and mitigations are on the right.")

# =====================================================================
# SLIDE 8 — Business Model
# =====================================================================
s = S[7]; strip_include(s)
set_sub(s, "How your solution creates value, reaches users and sustains itself.")
box(s, 0.7, 2.62, 3.85, 2.3)
chip(s, 0.85, 2.48, "① TARGET CUSTOMERS & MARKET")
text(s, 0.85, 2.8, 3.6, 0.5, [("149 M", {"b": True, "color": NAVY})], size=26, font="Arial Black")
text(s, 0.85, 3.32, 3.6, 0.3, [("Indians aged 60+ (2022), set to double by 2050", {"color": GREY, "i": True})], size=9.5)
text(s, 0.85, 3.62, 3.6, 1.25, [[("B2C: ", {"b": True}), ("city & NRI children of parents who live alone (22% of elderly)", {})],
    [("B2B2C: ", {"b": True}), ("hospitals (post-discharge), insurers, pension bodies, RWAs", {})]], size=10.5, spc=3)
box(s, 4.75, 2.62, 3.75, 2.3)
chip(s, 4.9, 2.48, "② REVENUE MODEL")
tiers = [("Free", "weekly check-in + scam alerts", TINT_B, NAVY), ("₹299–499 / mo", "Family plan: daily calls, nudges, digest, Claude", TINT_O, RUST), ("B2B per patient", "hospital follow-ups, insurer & pension programmes", TINT_G, GREEN)]
for i, (p, d, f, c) in enumerate(tiers):
    y = 2.82 + i * 0.68
    pb = box(s, 4.9, y, 1.35, 0.58, fill=f, line=c, lw=1, shd=False)
    shape_text(pb, [(p, {"b": True, "color": c})], size=10.5, margin=0.02)
    text(s, 6.32, y, 2.1, 0.58, [d], size=10, anchor=MSO_ANCHOR.MIDDLE)
box(s, 8.7, 2.62, 3.95, 2.3)
chip(s, 8.85, 2.48, "③ GO-TO-MARKET: FIRST 100 FAMILIES")
gtm = ["NRI & IT-city parent groups (Bengaluru, Pune, Dubai)", "Senior clubs & RWAs in Mysuru / Bengaluru", "1 hospital pilot: post-discharge follow-up calls", "Digital-arrest awareness content → free Scam Shield"]
text(s, 8.85, 2.82, 3.7, 2.05, [[("→ ", {"b": True, "color": ORANGE}), (g, {})] for g in gtm], size=11, spc=12)
box(s, 0.7, 5.15, 6.0, 1.72)
chip(s, 0.85, 5.01, "④ KEY COSTS & PARTNERSHIPS")
text(s, 0.85, 5.3, 5.75, 1.55, [[("Costs: ", {"b": True}), ("voice AI ≈ $0.10–0.12/min + telephony + LLM + AWS → ≈ ₹500–1,000 per parent/month at list price today.", {})],
    [("Path down: ", {"b": True}), ("2-min calls most days · startup grants & volume pricing · Exotel · WhatsApp voice notes for smartphone parents · self-hosted Indian speech models.", {})],
    [("Partners: ", {"b": True}), ("ElevenLabs, AWS, Exotel, hospitals, insurers.", {})]], size=10, spc=3)
box(s, 6.9, 5.15, 5.75, 1.72)
chip(s, 7.05, 5.01, "⑤ SUSTAINABILITY & GROWTH: EK CALL PACKS")
packs = [("KaiseHo", "elder care", RUST), ("YojanaCall", "welfare schemes", NAVY), ("KhataBol", "shop credit book", GREEN), ("PaisaWapas", "failed-txn refunds", AMBER)]
for i, (p, d, c) in enumerate(packs):
    x = 7.05 + i * 1.39
    pb = box(s, x, 5.38, 1.28, 0.75, fill=c, line=None, shd=False)
    shape_text(pb, [(p, {"b": True, "color": WHITE, "size": 10.5}), (d, {"color": WHITE, "size": 8.5})], size=10, margin=0.02)
text(s, 7.05, 6.2, 5.5, 0.62, [("One engine, many packs: each new use case reuses calls, MCP, control layer and post-call AI. One prevented hospitalisation or scam pays for years of calls.", {"i": True})], size=9.5)
s.notes_slide.notes_text_frame.text = ("Market: 149 million Indians are over 60 and the number doubles by 2050. Customers: children who live away (B2C), and hospitals, insurers and pension bodies (B2B2C). "
    "Freemium: free weekly check-ins and scam alerts; family plan ₹299–499/month. Honest costs: ≈ ₹500–1,000 per parent per month at list price today, with a clear path down. Ek Call is a platform: KaiseHo is pack #1.")

# =====================================================================
# SLIDE 9 — Prototype Showcase (extra)
# =====================================================================
s = S[8]; strip_include(s)
set_title(s, "Prototype Showcase")
set_sub(s, "What judges see live: a real call, real MCP tool calls, real alerts (screens from our prototype)")
def pic(path, x, y, w=None, h=None, name=None):
    p = s.shapes.add_picture(os.path.join(IMG, path), Inches(x), Inches(y), Inches(w) if w else None, Inches(h) if h else None)
    if name: p.name = name
    return p
lw_ = 6.15; lh = lw_ * 700 / 1400
fr = box(s, 0.7, 2.6, lw_ + 0.1, lh + 0.1, fill=WHITE)
pic("liveops.png", 0.75, 2.65, w=lw_, name="Live Ops screen")
text(s, 0.7, 2.6 + lh + 0.15, 6.25, 0.5, [[("① Live Ops (projector): ", {"b": True, "color": NAVY}), ("each MCP tool call appears in real time, colour-coded by risk tier", {})]], size=10)
ph = 4.2; pw = ph * 420 / 860
pic("telegram.png", 7.05, 2.55, h=ph, name="Telegram alert")
text(s, 6.95, 6.78, 2.3, 0.3, [[("② Son's Telegram", {"b": True, "color": NAVY})]], size=10, align=PP_ALIGN.CENTER)
dw = 3.4; dh = dw * 820 / 1400
box(s, 9.25, 2.6, dw + 0.06, dh + 0.06, fill=WHITE)
pic("dashboard.png", 9.28, 2.63, w=dw, name="Family dashboard")
text(s, 9.25, 2.7 + dh, 3.4, 0.25, [[("③ Family dashboard", {"b": True, "color": NAVY}), (": calls this week ↑", {})]], size=9.5)
cw = 2.1; ch = cw * 760 / 900
box(s, 9.9, 5.02, cw + 0.06, ch + 0.06, fill=WHITE)
pic("claude.png", 9.93, 5.05, w=cw, name="Claude via MCP")
text(s, 9.25, 5.05 + ch + 0.06, 3.4, 0.25, [[("④ Ravi asks Claude (MCP)", {"b": True, "color": NAVY})]], size=9.5, align=PP_ALIGN.CENTER)
db = box(s, 0.7, 6.15, 6.25, 0.7, fill=TINT_O, line=ORANGE, lw=1, shd=False)
shape_text(db, [[("3½-min live demo: ", {"b": True, "color": RUST}), ("a judge's phone rings → Metformin logged → “Is your knee better?” → judge reads a scam script → red alert + son's phone rings → Claude answers → privacy panel", {})]], size=9.5, align=PP_ALIGN.LEFT, margin=0.08)
s.notes_slide.notes_text_frame.text = ("Prototype screens. Left: the Live Ops projector view; every MCP tool call shows up live, colour-coded by risk tier, with the alert fan-out on the right. "
    "Middle: what Ravi sees on Telegram: the 'message heard' receipt, the urgent scam alert with Acknowledge/Call buttons, and the nudge with a conversation starter. "
    "Right: the family dashboard with 'family calls this week', and Claude answering 'How was Amma this week?' through our /mcp/family endpoint. Demo data is labelled as seeded history; calls are live.")

# =====================================================================
# SLIDE 10 — Control, Privacy & Trust (extra)
# =====================================================================
s = S[9]; strip_include(s)
set_title(s, "Control, Privacy & Evaluation")
set_sub(s, "Track 01 asks for “controlled”: our safety rules live in the server, not in the prompt.")
box(s, 0.7, 2.62, 4.3, 4.25)
chip(s, 0.85, 2.48, "RISK TIERS (ENFORCED IN CODE)")
tiers = [("T0", "Read", "context, recall memory, family reads", "8A8F98"), ("T1", "Log", "meds, wellbeing, memory (PII-redacted)", BLUE),
         ("T2", "Outward", "messages, reminders, schedule: rate-limited, needs consent", AMBER),
         ("T3", "Safety override", "scam & emergency: always alerts family", RED), ("T∞", "Forbidden", "money, OTP, bank, Aadhaar: NO TOOL EXISTS", INK)]
for i, (t, n, d, c) in enumerate(tiers):
    y = 2.85 + i * 0.79
    tb_ = box(s, 0.85, y, 0.7, 0.62, fill=c, line=None, shd=False)
    shape_text(tb_, [(t, {"b": True, "color": WHITE})], size=13, margin=0)
    text(s, 1.65, y - 0.02, 3.25, 0.68, [(n, {"b": True, "color": NAVY, "size": 11.5}), (d, {"size": 9.5})], size=10)
box(s, 5.2, 2.62, 3.6, 4.25)
chip(s, 5.35, 2.48, "PRIVACY BY DESIGN (DPDP ACT 2023)")
pv = [("🤝", "Consent call first; no schedule until she says yes"), ("🗣️", "AI disclosed in the first sentence, every call"),
      ("🔒", "She picks what's shared; “don't tell Ravi” is honoured"), ("🎙️", "No audio stored; transcripts deleted after 24 h"),
      ("📍", "Data in India (AWS Mumbai); delete all in one tap"), ("🧾", "Every tool call audited; “stop calling me” works instantly"),
      ("☎️", "Helplines: 112 · 1930 · 14416 · 14567")]
for i, (e, d) in enumerate(pv):
    text(s, 5.35, 2.8 + i * 0.57, 3.35, 0.55, [[(e + "  ", {"font": "Segoe UI Emoji"}), (d, {})]], size=10.5, anchor=MSO_ANCHOR.MIDDLE)
box(s, 9.0, 2.62, 3.65, 4.25)
chip(s, 9.15, 2.48, "EVALUATION HARNESS (TARGETS)")
ev = [["Eval", "Test set", "Target"],
      ["Scam detection", "40 cases, 8 patterns, 3 languages", "recall ≥ 90%\nprecision ≥ 85%"],
      ["Emergency detection", "20 utterances incl. look-alikes", "recall 100%"],
      ["PII redaction", "50 strings: OTP, Aadhaar, PAN", "0 leaks"],
      ["Tool latency", "100 calls per tool", "p95 < 400 ms"],
      ["Call quality", "10 real calls, 4 checks", "≥ 9 / 10"],
      ["Language", "Kannada, Hindi, Hinglish", "rating ≥ 4 / 5"]]
table(s, 9.12, 2.85, 3.42, 3.9, ev, [1.0, 1.32, 1.1], size=9, rowh=[0.34] + [0.59] * 6)
s.notes_slide.notes_text_frame.text = ("Control is a first-class feature. Every tool has a risk tier enforced by the MCP server, not the model; there is no tool that can touch money, OTPs or IDs. "
    "Privacy: consent first, AI disclosure, the parent controls sharing, no audio, transcripts deleted in 24 hours, data in India, one-tap delete. "
    "We measure ourselves with an eval harness; these are our targets, and the real numbers go here after the sprint.")

prs.save(OUT)
print("saved", OUT)
