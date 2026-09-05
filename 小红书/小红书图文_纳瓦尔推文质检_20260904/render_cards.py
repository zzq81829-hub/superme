# -*- coding: utf-8 -*-
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ASSETS = ROOT / "assets" / "studio"
FONTS = ASSETS / "fonts" / "sc" / "OTF" / "SimplifiedChinese"
IMAGES = ASSETS / "img"

W, H = 1080, 1440
M, FOOTER_Y = 112, 1334
PAPER = (246, 242, 232)
INK = (36, 35, 33)
MUTED = (116, 109, 99)
RED = (156, 38, 34)
GOLD = (168, 128, 70)
GREEN = (42, 104, 78)
AMBER = (177, 111, 38)
LINE = (213, 203, 187)


def font(weight="regular", size=28):
    names = {
        "heavy": "SourceHanSerifSC-Heavy.otf",
        "bold": "SourceHanSerifSC-Bold.otf",
        "regular": "SourceHanSerifSC-Regular.otf",
    }
    return ImageFont.truetype(str(FONTS / names[weight]), size)


def paper():
    base = Image.new("RGB", (W, H), PAPER)
    noise = Image.effect_noise((W, H), 9).convert("L")
    tint = Image.merge("RGB", (noise, noise, noise))
    return Image.blend(base, tint, 0.028)


def crop_fill(path, size, crop=(0, 0, 1, 1), desat=0.18, dark=0.0):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    x0, y0, x1, y1 = crop
    im = im.crop((int(x0*w), int(y0*h), int(x1*w), int(y1*h)))
    tw, th = size
    scale = max(tw / im.width, th / im.height)
    im = im.resize((int(im.width*scale), int(im.height*scale)), Image.Resampling.LANCZOS)
    left, top = (im.width-tw)//2, (im.height-th)//2
    im = im.crop((left, top, left+tw, top+th))
    im = ImageEnhance.Color(im).enhance(1-desat)
    if dark:
        im = Image.blend(im, Image.new("RGB", im.size, (18, 16, 14)), dark)
    return im


def wrap(draw, text, fnt, width):
    lines, cur = [], ""
    for ch in text:
        if ch == "\n":
            lines.append(cur)
            cur = ""
        elif draw.textlength(cur + ch, font=fnt) <= width:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def text_block(draw, text, xy, fnt, fill=INK, width=856, leading=1.72):
    x, y = xy
    step = int(fnt.size * leading)
    for line in wrap(draw, text, fnt, width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += step
    return y


def header(draw, right):
    draw.text((M, 90), "书斋 · 外网认知求真", font=font("bold", 20), fill=RED)
    rw = draw.textlength(right, font=font("regular", 18))
    draw.text((W-M-rw, 92), right, font=font("regular", 18), fill=MUTED)
    draw.ellipse((W-M-rw-42, 99, W-M-rw-30, 111), fill=INK)
    draw.ellipse((W-M-rw-24, 99, W-M-rw-12, 111), fill=RED)


def footer(draw, n):
    label = f"书斋 · 求真阅读 {n} / 6"
    fw = draw.textlength(label, font=font("regular", 17))
    draw.text((W-M-fw, FOOTER_Y), label, font=font("regular", 17), fill=MUTED)


def save(im, name):
    im.save(HERE / name, quality=95)


def page1():
    bg = crop_fill(IMAGES / "cardsharps.jpg", (W, H), crop=(0.05, 0.02, 0.95, 0.98), desat=0.05, dark=0.12)
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    d.rounded_rectangle((62, 62, 438, 156), 14, fill=(246, 242, 232, 242), outline=(151, 132, 108, 255))
    d.text((88, 82), "书斋 · 外网认知求真", font=font("bold", 22), fill=(53, 47, 42, 255))
    d.text((88, 118), "NAVAL / 2018", font=font("regular", 16), fill=(156, 38, 34, 255))
    d.rounded_rectangle((74, 350, 954, 752), 24, fill=(23, 21, 20, 228))
    title_f = font("heavy", 112)
    for i, line in enumerate(("越忙，", "越难自由？")):
        tw = d.textlength(line, font=title_f)
        d.text(((W-tw)/2, 400+i*142), line, font=title_f, fill=(248, 244, 235, 255))
    d.line((430, 704, 650, 704), fill=(184, 54, 48, 255), width=5)
    d.rounded_rectangle((62, 1222, 1018, 1366), 18, fill=(18, 17, 16, 190))
    d.text((92, 1254), "纳瓦尔财富推文质检", font=font("bold", 31), fill=(248, 244, 235, 255))
    d.text((92, 1304), "原推求真 × 所有权边界 × 好书承接", font=font("regular", 22), fill=(222, 208, 187, 255))
    save(Image.alpha_composite(bg.convert("RGBA"), ov).convert("RGB"), "01_封面.png")


def page2():
    im = paper(); d = ImageDraw.Draw(im); header(d, "02 · 原推原文")
    d.text((M, 178), "这条推文，真的存在", font=font("heavy", 49), fill=INK)
    d.text((M, 250), "公开归档核验 · 原文重绘，不伪装平台截图", font=font("regular", 22), fill=RED)
    # X-style source reconstruction
    d.rounded_rectangle((M, 350, W-M, 1020), 30, fill=(20, 21, 23), outline=(65, 66, 69), width=2)
    d.ellipse((160, 414, 244, 498), fill=(232, 232, 232))
    d.text((184, 424), "N", font=font("bold", 35), fill=(24, 24, 24))
    d.text((270, 410), "Naval", font=font("bold", 29), fill=(246, 246, 246))
    d.text((270, 456), "@naval · May 31, 2018", font=font("regular", 21), fill=(145, 151, 157))
    d.text((888, 414), "X", font=font("bold", 38), fill=(245, 245, 245))
    y = 558
    y = text_block(d, "How to Get Rich\n(without getting lucky):", (160, y), font("heavy", 43), (246, 246, 246), 760, 1.45)
    y += 54
    d.text((160, y), "Code and media are", font=font("regular", 29), fill=(231, 231, 231)); y += 52
    d.text((160, y), "permissionless leverage.", font=font("regular", 29), fill=(231, 231, 231)); y += 78
    d.line((160, y, 920, y), fill=(67, 69, 72), width=1)
    d.text((160, y+34), "41-TWEET THREAD · VERIFIED ARCHIVE", font=font("bold", 18), fill=(160, 166, 173))
    d.text((M, 1090), "他没说“努力没用”。", font=font("heavy", 36), fill=RED)
    d.text((M, 1152), "他说的是：只卖时间，很难摆脱时间的上限。", font=font("regular", 27), fill=INK)
    d.text((M, 1215), "来源：x.com/naval/status/1002103360646823936", font=font("regular", 17), fill=MUTED)
    footer(d, 2); save(im, "02_原推原文.png")


def page3():
    im = paper(); d = ImageDraw.Draw(im); header(d, "03 · 五条质检")
    d.text((M, 178), "五句话，只有两句能直接带走", font=font("heavy", 46), fill=INK)
    d.text((M, 250), "情绪可以放大，事实不能。", font=font("regular", 25), fill=RED)
    rows = [
        ("⚠", "卖时间绝对不能致富", "方向对，“绝对”错", AMBER),
        ("✓", "代码和媒体是无许可杠杆", "框架成立，有成本", GREEN),
        ("⚠", "专长无法外包或自动化", "2018 有力，2026 过满", AMBER),
        ("⚠", "读比听快，做比看快", "多数场景，不是定律", AMBER),
        ("✓", "警惕快速致富承诺", "可靠的风险提醒", GREEN),
    ]
    y = 350
    for mark, claim, verdict, color in rows:
        d.ellipse((M, y+4, M+54, y+58), fill=color)
        mw = d.textlength(mark, font=font("bold", 26))
        d.text((M+27-mw/2, y+11), mark, font=font("bold", 26), fill=(255,255,255))
        d.text((M+82, y), claim, font=font("bold", 27), fill=INK)
        d.text((M+82, y+48), verdict, font=font("regular", 23), fill=color)
        y += 153
    d.line((M, 1144, W-M, 1144), fill=LINE, width=2)
    d.text((M, 1188), "质检结论", font=font("bold", 22), fill=RED)
    text_block(d, "把纳瓦尔当作思考起点，别当作发财说明书。", (M, 1230), font("heavy", 31), INK, 856, 1.6)
    footer(d, 3); save(im, "03_质检打标.png")


def page4():
    im = paper(); d = ImageDraw.Draw(im); header(d, "04 · 机制解释")
    band = crop_fill(IMAGES / "bruegel_cockaigne.jpg", (W, 500), crop=(0.0, 0.0, 1.0, 0.72), desat=0.28, dark=0.06)
    im.paste(band, (0, 150)); d = ImageDraw.Draw(im)
    d.rectangle((0, 560, W, 650), fill=(21, 20, 19, 180))
    d.text((M, 581), "“努力”不是问题，只有一种收入才是", font=font("bold", 31), fill=(248,244,235))
    y = 730
    d.text((M, y), "工资", font=font("heavy", 38), fill=INK)
    d.text((310, y), "所有权", font=font("heavy", 38), fill=RED)
    d.text((610, y), "杠杆", font=font("heavy", 38), fill=GOLD)
    d.text((M, y+64), "出售一段时间", font=font("regular", 24), fill=MUTED)
    d.text((310, y+64), "持有一部分结果", font=font("regular", 24), fill=MUTED)
    d.text((610, y+64), "让一次投入重复工作", font=font("regular", 24), fill=MUTED)
    d.line((M, 900, W-M, 900), fill=LINE, width=2)
    d.text((M, 958), "明天就能用", font=font("bold", 23), fill=RED)
    y = text_block(d, "把今天的工作分成两栏：", (M, 1010), font("regular", 27), INK, 856, 1.7)
    y += 18
    d.text((M, y), "A  做完就归零", font=font("bold", 29), fill=INK)
    d.text((M+400, y), "B  明天还能复用", font=font("bold", 29), fill=RED)
    y += 72
    text_block(d, "每天把 30 分钟从 A 挪到 B：写模板、做作品、建系统。", (M, y), font("regular", 26), INK, 856, 1.7)
    footer(d, 4); save(im, "04_所有权与杠杆.png")


def page5():
    im = paper(); d = ImageDraw.Draw(im); header(d, "05 · 好书承接")
    d.text((M, 178), "这本书值得买，但别把它当圣经", font=font("heavy", 45), fill=INK)
    d.text((M, 252), "先给边界，再给推荐。", font=font("regular", 24), fill=RED)
    # restrained book mockup
    d.rounded_rectangle((M, 364, 470, 970), 12, fill=(28, 29, 31), outline=GOLD, width=2)
    d.rectangle((136, 388, 151, 946), fill=RED)
    d.text((186, 430), "THE", font=font("regular", 21), fill=(210,195,168))
    d.text((186, 476), "ALMANACK", font=font("heavy", 41), fill=(248,244,235))
    d.text((186, 536), "OF NAVAL", font=font("heavy", 37), fill=(248,244,235))
    d.text((186, 596), "RAVIKANT", font=font("heavy", 37), fill=(248,244,235))
    d.line((186, 686, 408, 686), fill=RED, width=4)
    d.text((186, 732), "财富与幸福指南", font=font("bold", 24), fill=(210,195,168))
    d.text((186, 870), "ERIC JORGENSON", font=font("regular", 18), fill=(150,144,133))
    x = 528
    d.text((x, 370), "《纳瓦尔宝典》", font=font("heavy", 38), fill=INK)
    d.text((x, 430), "埃里克·乔根森 编", font=font("regular", 22), fill=MUTED)
    d.text((x, 468), "赵灿 译 · 中信出版社", font=font("regular", 22), fill=MUTED)
    d.text((x, 548), "适合", font=font("bold", 23), fill=GREEN)
    y = text_block(d, "想把工资、所有权和杠杆想清楚的人。", (x, 592), font("regular", 25), INK, 430, 1.65)
    y += 32
    d.text((x, y), "不适合", font=font("bold", 23), fill=RED); y += 44
    y = text_block(d, "只想找一条照抄就能发财的捷径。", (x, y), font("regular", 25), INK, 430, 1.65)
    d.line((M, 1046, W-M, 1046), fill=LINE, width=2)
    d.text((M, 1100), "推荐理由", font=font("bold", 22), fill=RED)
    text_block(d, "它没有替你做决定，只逼你重算：我今天是在挣钱，还是在积累未来仍属于我的东西？", (M, 1152), font("regular", 27), INK, 856, 1.65)
    d.text((M, 1260), "想系统读完，可用笔记下方官方好物卡。", font=font("bold", 22), fill=RED)
    footer(d, 5); save(im, "05_好书带货卡.png")


def page6():
    im = paper(); d = ImageDraw.Draw(im); header(d, "06 · 收束与讨论")
    d.text((M, 190), "先别辞职。", font=font("heavy", 61), fill=INK)
    d.text((M, 286), "先别再把全部时间卖光。", font=font("heavy", 50), fill=RED)
    d.line((M, 390, M+160, 390), fill=RED, width=4)
    d.text((M, 452), "今晚做一个 10 分钟盘点", font=font("bold", 27), fill=INK)
    actions = [
        ("01", "写下本周所有重复工作"),
        ("02", "挑一件做成可复用模板"),
        ("03", "给它一个可追踪的结果"),
    ]
    y = 542
    for n, item in actions:
        d.text((M, y), n, font=font("bold", 22), fill=RED)
        d.text((M+90, y-7), item, font=font("heavy", 32), fill=INK)
        d.line((M+90, y+52, W-M, y+52), fill=LINE, width=1)
        y += 150
    d.text((M, 1025), "评论区站队", font=font("bold", 23), fill=RED)
    text_block(d, "普通人先卖时间、再积累杠杆，是现实；\n把工资说得一无是处，是不是一种傲慢？", (M, 1075), font("heavy", 32), INK, 856, 1.72)
    d.text((M, 1248), "下一期：你的“专长”，真的不能被 AI 替代吗？", font=font("regular", 22), fill=MUTED)
    footer(d, 6); save(im, "06_行动与讨论.png")


def contact_sheet():
    names = ["01_封面.png", "02_原推原文.png", "03_质检打标.png", "04_所有权与杠杆.png", "05_好书带货卡.png", "06_行动与讨论.png"]
    sheet = Image.new("RGB", (1140, 1060), (30, 29, 28))
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        thumb = Image.open(HERE / name).resize((320, 427), Image.Resampling.LANCZOS)
        x = 50 + (i % 3) * 365
        y = 48 + (i // 3) * 500
        sheet.paste(thumb, (x, y))
        d.text((x, y+438), name, font=font("regular", 17), fill=(235,230,219))
    sheet.save(HERE / "00_六页总览.png", quality=95)


if __name__ == "__main__":
    for render in (page1, page2, page3, page4, page5, page6):
        render()
    contact_sheet()
    print("Rendered 6 cards + contact sheet")
