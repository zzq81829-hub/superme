# -*- coding: utf-8 -*-
"""
书斋批量图文引擎 —— 油画带式 V5 定稿版式
4 篇：课题分离 / 微习惯 / 复利 / 信息茧房
"""
import os
import sys as _sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

_SMART = os.path.dirname(os.path.abspath(__file__))
if not os.path.exists(os.path.join(_SMART, "smartart.py")):
    _SMART = os.path.dirname(_SMART)
_sys.path.insert(0, _SMART)

ROOT = r"C:/Users/22145/Desktop/superme/小红书"
ASSETS = r"C:/Users/22145/Desktop/superme/assets/studio"
FONTS = os.path.join(ASSETS, "fonts", "sc", "OTF", "SimplifiedChinese")
IMG = os.path.join(ASSETS, "img")

W, H = 1080, 1440
M = 112
CW = W - 2 * M
FOOTER_Y = 1336
MAX_Y = 1250

def font(kind, size):
    return ImageFont.truetype(os.path.join(FONTS, f"SourceHanSerifSC-{kind}.otf"), size)

def kai(size):
    return ImageFont.truetype("C:/Windows/Fonts/simkai.ttf", size)

def paper_bg(pal, seed):
    np.random.seed(seed)
    noise = np.random.normal(0, 3.0, (H, W, 3)).astype(np.float32)
    base = np.full((H, W, 3), pal["paper"], dtype=np.float32)
    return Image.fromarray(np.clip(base + noise, 0, 255).astype(np.uint8), mode="RGB")

def cover_fit(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    if w / h > W / H:
        nw = int(h * W / H); left = (w - nw) // 2
        im = im.crop((left, 0, left + nw, h))
    else:
        nh = int(w * H / W); top = (h - nh) // 2
        im = im.crop((0, top, w, top + nh))
    return im.resize((W, H), Image.Resampling.LANCZOS)

def fit_region(img, region, tw, th):
    """取 region 内与 tw/th 同比例的最大子框并裁切。"""
    im = img
    w, h = im.size
    rx0, ry0, rx1, ry1 = [region[i] * (w if i % 2 == 0 else h) for i in range(4)]
    rw, rh = rx1 - rx0, ry1 - ry0
    t = tw / th
    if rw / rh > t:
        nw2 = rw; nh2 = rw / t
        if nh2 > rh: nh2 = rh; nw2 = nh2 * t
    else:
        nh2 = rh; nw2 = rh * t
        if nw2 > rw: nw2 = rw; nh2 = nw2 / t
    ry0 = max(0, min(ry0 + (rh - nh2) / 2, h - nh2))
    rx0 = max(0, min(rx0 + (rw - nw2) / 2, w - nw2))
    return im.crop((int(rx0), int(ry0), int(rx0 + nw2), int(ry0 + nh2)))

def band(img, d, art, region, h, pal):
    """全宽画带 + 智能裁切：自动对准画中主角（人脸优先/显著区），填满画带不切脸。"""
    import smartart
    im = Image.open(os.path.join(IMG, art)).convert("RGB")
    box = smartart.smart_band_crop(im, region, W / h)
    crop = im.crop(box).resize((W, h), Image.Resampling.LANCZOS)
    img.paste(crop, (0, 0))
    d.line([(0, h), (W, h)], fill=pal["line"], width=1)
    return h + 50

def wrap(d, text, x, y, max_w, f, fill, spacing=1.66):
    from cjktext import wrap as _w
    return _w(d, text, x, y, max_w, f, fill, spacing)
    lines = []
    for para in text.split("\n"):
        if not para:
            lines.append(""); continue
        cur = ""
        for ch in para:
            if d.textlength(cur + ch, font=f) <= max_w:
                cur += ch
            else:
                if cur: lines.append(cur)
                cur = ch
        lines.append(cur)
    step = int(f.size * spacing)
    for ln in lines:
        if ln:
            d.text((x, y), ln, font=f, fill=fill)
        y += step
    return y

def render_cover(pkg, T):
    pal = T["pal"]
    bg = cover_fit(os.path.join(IMG, T["cover"]["art"]))
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    f1 = font("Bold", 22); f2 = font("Regular", 18)
    l1, l2 = T["seriesName"], T["cover"]["badge2"]
    tw = max(d.textlength(l1, font=f1), d.textlength(l2, font=f2))
    px, py = 24, 18; cx, cy = 64, 64
    d.rounded_rectangle([cx, cy, cx + tw + px * 2, cy + 30 + 32 + py * 2], radius=14,
                        fill=(248, 242, 228, 240), outline=(120, 104, 80, 255), width=1)
    d.text((cx + px, cy + py), l1, font=f1, fill=(86, 70, 50, 255))
    d.text((cx + px, cy + py + 36), l2, font=f2, fill=(160, 108, 60, 255))
    by0, by1 = 1236, 1364
    d.rounded_rectangle([56, by0, W - 56, by1], radius=18, fill=(34, 27, 20, 168))
    d.text((88, by0 + 48), T["cover"]["subtitle"], font=font("Regular", 26), fill=(247, 241, 227, 255))
    ft = font("Regular", 15)
    ttw = d.textlength(T["cover"]["label"], font=ft)
    d.text((W - 88 - ttw, by0 + 52), T["cover"]["label"], font=ft, fill=(235, 224, 205, 200))
    # 标题加强卡（字号自适应行宽）
    lines = T["cover"]["title"]
    fs = 100
    while fs > 74 and max(d.textlength(x, font=font("Heavy", fs)) for x in lines) > 760:
        fs -= 4
    ft2 = font("Heavy", fs)
    mw = max(d.textlength(x, font=ft2) for x in lines)
    bw = mw + 110
    bh = int(fs * 1.42 * len(lines)) + 36 * (len(lines) - 1) + 90
    bx = (W - bw) / 2; by = 330
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=22, fill=(32, 26, 20, 238))
    ty = by + 40
    step = int(fs * 1.42)
    for x in lines:
        xw = d.textlength(x, font=ft2)
        d.text((bx + (bw - xw) / 2, ty), x, font=ft2, fill=(248, 241, 226, 255))
        ty += step
    fpg = font("Regular", 16)
    pg = T["seriesName"] + " 01"
    ptw = d.textlength(pg, font=fpg)
    d.text((bx + (bw - ptw) / 2, ty + 2), pg, font=fpg, fill=(204, 180, 142, 235))
    img = Image.alpha_composite(bg.convert("RGBA"), ov).convert("RGB")
    img.save(os.path.join(pkg, "01_封面.png"), quality=95)
    print("cover", T["dir"])

def render_page(pkg, T, idx, Pg):
    pal = T["pal"]
    img = paper_bg(pal, 100 + idx * 7)
    d = ImageDraw.Draw(img)
    if Pg.get("art"):
        hb = Pg["h"]
        y = band(img, d, Pg["art"], Pg.get("region"), hb, pal)
        f = font("Regular", 15)
        tw = d.textlength(Pg["label"], font=f)
        d.text((W - tw - 46, hb - 44), Pg["label"], font=f, fill=(250, 246, 236))
    else:
        y = 200
    for op in Pg["ops"]:
        k = op[0]
        if k == "tag":
            d.text((M, y), op[1], font=font("Bold", 24), fill=pal["bronze"]); y += 40
        elif k == "title":
            y = wrap(d, op[1], M, y, CW, font("Heavy", int(op[2] * 1.2) if len(op) > 2 else 50), pal["slate"], spacing=1.32)
            y += 8
        elif k == "space":
            y += op[1]
        elif k == "kai":
            y = wrap(d, op[1], M, y, CW, kai(int(op[2] * 1.2) if len(op) > 2 else 33), pal["slate"], spacing=1.55)
            y += 6
        elif k == "kai_b":
            y = wrap(d, op[1], M, y, CW, kai(int(op[2] * 1.2) if len(op) > 2 else 33), pal["bronze"], spacing=1.55)
            y += 6
        elif k == "items":
            fst = font("Bold", 25); fb = font("Regular", 25)
            for tag, body in op[1]:
                d.text((M, y), tag, font=fst, fill=pal["bronze"])
                pw = d.textlength(tag, font=fst) + 14
                y = wrap(d, body, M + pw, y + 1, CW - pw, fb, pal["ink"], spacing=1.5)
                y += 18
            y += 10
        elif k == "mono":
            d.text((M, y), "内心独白揭穿", font=font("Bold", 25), fill=pal["bronze"]); y += 38
            y = wrap(d, op[1], M, y, CW, kai(34), pal["slate"], spacing=1.55)
            y += 8
        elif k == "lead":
            d.text((M, y), op[1], font=font("Bold", 25), fill=pal["slate"]); y += 34
        elif k == "lead_b":
            d.text((M, y), op[1], font=font("Bold", 25), fill=pal["bronze"]); y += 34
        elif k == "body":
            y = wrap(d, op[1], M, y, CW, font("Regular", 25), pal["ink"], spacing=1.52)
            y += 22
        elif k == "parts":
            fh2 = font("Bold", 25); fb = font("Regular", 25)
            for t, b in op[1]:
                d.text((M, y), t, font=fh2, fill=pal["slate"])
                y += 34
                y = wrap(d, b, M + 24, y, CW - 24, fb, pal["ink"], spacing=1.5)
                y += 24
        elif k == "steps":
            fst = font("Bold", 23); fb = font("Regular", 25)
            for i, (t, b) in enumerate(op[1]):
                pw = d.textlength(t, font=fst)
                d.text((M, y), t, font=fst, fill=pal["bronze"] if i == len(op[1]) - 1 else pal["slate"])
                y = wrap(d, b, M + pw + 4, y + 1, CW - pw - 4, fb, pal["ink"], spacing=1.5)
                y += 22
        elif k == "book":
            d.text((M, y), op[1], font=font("Heavy", 30), fill=pal["ink"]); y += 48
            d.text((M, y), op[2], font=font("Regular", 21), fill=pal["muted"]); y += 32
            if len(op) > 3 and op[3]:
                d.text((M, y), op[3], font=font("Regular", 21), fill=pal["bronze"]); y += 10
            y += 16
        elif k == "quote":
            y = wrap(d, op[1], M, y, CW, kai(int(op[2] * 1.2) if len(op) > 2 else 30), pal["slate"], spacing=1.55)
            if len(op) > 3 and op[3]:
                d.text((M, y + 4), op[3], font=font("Regular", 18), fill=pal["muted"])
                y += 34
            y += 10
        elif k == "hook":
            y = wrap(d, op[1], M, y, CW, font("Bold", 25), pal["bronze"], spacing=1.45)
            y += 6
        elif k == "hairline":
            d.line([(M, y), (M + 120, y)], fill=pal["bronze"], width=2); y += 40
        elif k == "action":
            fa1 = font("Bold", 26); fa2 = font("Regular", 26)
            d.text((M, y), "今晚就能用", font=fa1, fill=pal["bronze"])
            tw = d.textlength("今晚就能用", font=fa1) + 14
            y = wrap(d, op[1], M + tw, y + 1, CW - tw, fa2, pal["ink"], spacing=1.5)
            y += 16
        elif k == "preview":
            d.text((M, y), op[1], font=font("Bold", 21), fill=pal["bronze"]); y += 34
            y = wrap(d, op[2], M, y, CW, font("Heavy", 29), pal["slate"], spacing=1.35)
            y += 20
        elif k == "question":
            d.text((M, y), "【今晚聊聊】", font=font("Bold", 21), fill=pal["bronze"]); y += 34
            y = wrap(d, op[1], M, y, CW, kai(27), pal["slate"], spacing=1.52)
            y += 6
        elif k == "kai_end":
            y = wrap(d, op[1], M, y, CW, kai(29), pal["bronze"], spacing=1.55)
            y += 8
    if y > MAX_Y:
        print(f"[!] {T['dir']} 页{idx} 溢出到 {y}")
    else:
        print(f"[ok] {T['dir']} 页{idx} 底端 {y}（余 {MAX_Y - y}px）")
    f = font("Regular", 17)
    foot = f"{T['seriesName']} {idx} / 6"
    tw = d.textlength(foot, font=f)
    d.text((W - M - tw, FOOTER_Y), foot, font=f, fill=pal["muted"])
    img.save(os.path.join(pkg, f"0{idx}_{Pg['fname']}.png"), quality=95)

# ================= 4 篇内容 =================
PAPER1 = {"paper": (247, 241, 228), "slate": (62, 86, 114), "bronze": (172, 126, 64),
          "ink": (56, 48, 38), "muted": (126, 116, 100), "line": (216, 206, 188)}
PAPER2 = {"paper": (247, 242, 232), "slate": (52, 86, 100), "bronze": (190, 116, 66),
          "ink": (54, 46, 38), "muted": (126, 114, 100), "line": (218, 208, 190)}
PAPER3 = {"paper": (241, 243, 238), "slate": (70, 96, 108), "bronze": (184, 128, 92),
          "ink": (52, 48, 42), "muted": (120, 116, 106), "line": (212, 210, 198)}
PAPER4 = {"paper": (244, 238, 226), "slate": (56, 66, 76), "bronze": (168, 92, 54),
          "ink": (52, 46, 40), "muted": (124, 114, 102), "line": (214, 204, 188)}

import art_selector

A = "《不安》· 蒙克 · 1894 · 蒙克美术馆"
DUR = "《书房中的圣杰罗姆》铜版画 · 丢勒 · 1514 · 华盛顿国家美术馆"
WAN = "《雾海上的旅人》· 弗里德里希 · 约1817 · 汉堡美术馆"
REM = "《自画像》· 伦勃朗 · 1659 · 华盛顿国家美术馆"
NIZ = "《渔庄秋霁图》局部 · 倪瓒 · 元代 · 上海博物馆"
MILK = "《倒牛奶的女仆》· 维米尔 · 约1660 · 阿姆斯特丹国立博物馆"
BOSCH = "《愚人船》· 博斯 · 约1490-1500 · 卢浮宫"
STAR = "《星月夜》· 梵高 · 1889 · MoMA"
NARC = "《那喀索斯》· 卡拉瓦乔 · 约1597 · 罗马国立古代艺术馆"
BED = "《阿尔勒的卧室》· 梵高 · 1888 · 梵高博物馆"
COCKAIGNE = "《安乐乡》· 老勃鲁盖尔 · 约1567 · 慕尼黑老绘画陈列馆"
BLIND = "《盲人领盲人》· 老勃鲁盖尔 · 1568 · 那不勒斯卡波迪蒙特博物馆"

# 2026-09-05 新增拓展名画（消除审美疲劳）
DEGAS = "《苦艾酒馆》· 德加 · 1876 · 巴黎奥赛博物馆"
ABBEY = "《橡树林中的修道院》· 弗里德里希 · 1810 · 柏林旧国家画廊"
HAMMER = "《室内》· 哈默斯霍伊 · 1900 · 丹麦国立美术馆"
TURNER = "《雨，蒸汽和速度》· 透纳 · 1844 · 伦敦国家美术馆"
GEO = "《地理学家》· 维米尔 · 约1668 · 法兰克福施泰德艺术馆"
PHILOSOPHER = "《沉思的哲学家》· 伦勃朗 · 1632 · 巴黎卢浮宫"
PARASOL = "《撑阳伞的女人》· 莫奈 · 1875 · 华盛顿国家美术馆"

TOPICS = [
    dict(dir="小红书图文_课题分离_20260902", seriesName="书斋 · 阿德勒系列", pal=PAPER1,
         cover=dict(art="vermeer_milkmaid.jpg", badge2="课题分离 · 第 01 篇",
                    title=["别人怎么看你，", "真的跟你没关系"],
                    subtitle="把别人的课题，还给别人",
                    label="《倒牛奶的女仆》· 维米尔 · 约1660 · 阿姆斯特丹国立博物馆"),
         pages=[
            dict(art="anxiety.jpg", region=(0.05, 0.25, 0.95, 0.80), h=500, label=A, fname="行为清单", ops=[
                ("tag", "02 · 行为清单与内心独白"),
                ("title", "你讨好所有人，唯独没讨好自己", 42), ("space", 66),
                ("kai_b", "“回复慢了就道歉，拒绝的话到嘴边又咽回去。”", 26), ("space", 48),
                ("items", [("回", "消息秒回、不敢已读不回，怕对方觉得你冷淡。"),
                           ("发", "朋友圈反复斟酌，把真心话删成安全发言。"),
                           ("察", "别人一个眼神、一句“随便”，你能失眠一整晚。")]),
                ("space", 34),
                ("mono", "表面上你温和、好说话、人缘不错，\n心里却只剩一句：“万一他不喜欢我怎么办？”\n——你在替所有人活，唯独没替自己活过。")]),
            dict(art="friedrich_wanderer.jpg", region=(0.10, 0.05, 0.95, 0.65), h=500, label=WAN, fname="机制解释", ops=[
                ("tag", "03 · 机制解释"),
                ("title", "课题分离：谁的课题，后果谁承担", 40), ("space", 40),
                ("body", "阿德勒把人生烦恼分成两类课题：我的，和别人的。判断标准只有一条——这件事的后果，最终由谁承担。"),
                ("space", 30),
                ("parts", [("① 他的课题", "他怎么看我、喜不喜欢我、回不回消息——后果由他承担。"),
                           ("② 我的课题", "我怎么表达、怎么选择、怎么活——后果由我承担。"),
                           ("③ 越界即内耗", "你替他承担后果，是烦恼唯一的来源。")]),
                ("space", 24),
                ("hook", "—— 把别人的课题还回去，为什么这么难？")]),
            dict(art="duerer_jerome.jpg", region=(0.02, 0.12, 0.98, 0.62), h=500, label=DUR, fname="经典书证", ops=[
                ("tag", "04 · 经典书证"),
                ("title", "一切烦恼，都是人际关系的烦恼", 40), ("space", 44),
                ("book", "《被讨厌的勇气》", "岸见一郎 · 古贺史健 · 哲人与青年的对话", "阿德勒心理学入门"),
                ("space", 30),
                ("quote", "“关于自己的课题，怎么做是你的课题；\n别人怎么评价，是别人的课题。”", 26, "—— 书中转述"),
                ("space", 34),
                ("lead", "阿德勒的原点"),
                ("body", "人之所以痛苦，不是事情本身，而是过度在意“别人怎么看”——把评价权交出去的那一刻，你就弄丢了自己。"),
                ("space", 20),
                ("hook", "—— 但课题分离，是不是等于冷漠、不管别人？")]),
            dict(art="rembrandt_self1659.jpg", region=(0.06, 0.05, 0.94, 0.72), h=460, label=REM, fname="双面剖析", ops=[
                ("tag", "05 · 双面剖析"),
                ("title", "课题分离，不是冷漠，是边界", 40), ("space", 38),
                ("lead_b", "为什么难"),
                ("body", "因为“被讨厌”的恐惧太真实——分离课题，意味着可能真的不被喜欢。"),
                ("space", 20),
                ("lead", "为什么必须"),
                ("body", "边界不是墙，是筛子：留下该你负责的，放走不该你扛的。"),
                ("space", 26),
                ("lead", "我的真实经历（可换创始人真实经历）"),
                ("steps", [("① 以前：", "同事一句冷淡，我能内耗一整天，反复检讨自己。"),
                           ("② 后来自问：", "他的情绪，后果由谁承担？答案让我愣住了。"),
                           ("③ 现在：", "我会说“这是我的课题”“那是你的课题”，人反而轻松了。")]),
                ("space", 16),
                ("kai_end", "承认“我不可能让所有人满意”，你才真正开始活自己的课题。")]),
            dict(art="starry_night.jpg", region=(0.30, 0.35, 0.72, 0.80), h=500, label=STAR, fname="结尾", ops=[
                ("tag", "06 · 释然闭环"),
                ("title", "把别人的课题，还给别人", 40), ("space", 52),
                ("kai", "真正的自由，不是被所有人喜欢，\n而是别人的课题，终于不再是你的课题。", 30),
                ("space", 20), ("hairline",),
                ("action", "写下最近让你在意的一件评价，标出：后果由谁承担？"),
                ("space", 20),
                ("preview", "【下期预告 · 习惯养成系列 01】", "《每天只做 1 个俯卧撑》"),
                ("space", 20),
                ("question", "你最近一次为别人的看法失眠，是在意谁的评价？")]),
        ]),

    dict(dir="小红书图文_微习惯_20260902", seriesName="书斋 · 习惯养成系列", pal=PAPER2,
         cover=dict(art="monet_sunrise.jpg", badge2="微习惯 · 第 01 篇",
                    title=["每天只做", "1 个俯卧撑"],
                    subtitle="小到不可能失败，大到无法忽视",
                    label="《日出·印象》· 莫奈 · 1872 · 巴黎马莫丹美术馆"),
         pages=[
            dict(art="rembrandt_self1659.jpg", region=(0.06, 0.10, 0.94, 0.80), h=500, label=REM, fname="行为清单", ops=[
                ("tag", "02 · 行为清单与内心独白"),
                ("title", "你缺的不是意志力，是起点大到吓退自己", 40), ("space", 60),
                ("kai_b", "“第 17 次立 flag 了——这次一定要坚持。”", 26), ("space", 42),
                ("items", [("立", "年初列满计划表：健身年卡、英语打卡、早睡誓言。"),
                           ("崩", "第一天雄心万丈，第三天加一次班，就再没捡起来。"),
                           ("骂", "每次放弃后骂自己“没毅力”，然后靠更大的计划重启。")]),
                ("space", 30),
                ("mono", "你以为是意志力不够，其实是你总想一步跨到终点——\n大脑一看到「巨大目标」就放弃了。")]),
            dict(art="vermeer_milkmaid.jpg", region=(0.08, 0.15, 0.92, 0.85), h=500, label=MILK, fname="机制解释", ops=[
                ("tag", "03 · 机制解释"),
                ("title", "小到不可能失败，大脑才会放行", 40), ("space", 40),
                ("body", "意志力是有限资源，别用它对抗惯性。把动作小到不可能失败，大脑觉得“这不算什么”，才愿意开始。"),
                ("space", 30),
                ("parts", [("① 启动阻力", "目标越大，启动成本越高，拖延越重。"),
                           ("② 完成即奖励", "小动作天天完成，每次“做到了”都在给大脑发奖。"),
                           ("③ 身份改变", "你不再是“想健身的人”，而是“每天做 1 个俯卧撑的人”。")]),
                ("space", 24),
                ("hook", "—— 一个俯卧撑，真的能长成习惯吗？")]),
            dict(art=None, fname="经典书证", ops=[
                ("tag", "04 · 经典书证"),
                ("title", "从每天 1 个俯卧撑开始的作者", 40), ("space", 40),
                ("book", "《微习惯》", "斯蒂芬·盖斯 · 2013 · 作者亲测", "“懒人”养成法"),
                ("space", 24),
                ("body", "盖斯自称“懒人”，直到把目标砍到“每天 1 个俯卧撑”——两年后练出身材，写下这本书。斯坦福行为科学家福格（BJ Fogg）同款逻辑：让行为小到不可能失败，再用即时庆祝放大它。"),
                ("space", 26),
                ("quote", "“把习惯缩小到不可思议，坚持就会变得不可思议。”", 25, "—— 书中转述"),
                ("space", 20),
                ("hook", "—— 但“只做 1 个”，会不会让人真的只做 1 个？")]),
            dict(art="bedroom.jpg", region=(0.25, 0.30, 0.80, 0.80), h=460, label=BED, fname="双面剖析", ops=[
                ("tag", "05 · 双面剖析"),
                ("title", "“只做 1 个”，不是让你停在 1 个", 38), ("space", 36),
                ("lead", "为什么有效"),
                ("body", "它骗过大脑的启动阻力，让你先开始——开始的次数，决定习惯的存亡。"),
                ("space", 18),
                ("lead_b", "防走火"),
                ("body", "“1 个”是底线不是天花板：状态好就多做，状态差就守住 1 个。"),
                ("space", 24),
                ("lead", "我的真实经历（可换创始人真实经历）"),
                ("steps", [("① 以前：", "总想一次练一小时，结果一年去不了三次健身房。"),
                           ("② 调整后：", "改成“到家先做 1 个”，往往做着做着就完成了 20 分钟。"),
                           ("③ 现在：", "连续 60 多天没断过——断的那天，也至少做了 1 个。")]),
                ("space", 14),
                ("kai_end", "习惯不是靠爆发建立的，是靠“不中断”建立的。")]),
            dict(art="starry_night.jpg", region=(0.10, 0.20, 0.95, 0.85), h=500, label=STAR, fname="结尾", ops=[
                ("tag", "06 · 释然闭环"),
                ("title", "每晚一点，乘以三百六十五", 40), ("space", 48),
                ("kai", "别高估一天能做的事，\n别低估一年能长成的自己。", 30),
                ("space", 18), ("hairline",),
                ("action", "睡前做 1 个俯卧撑（或读 1 页、写 1 行）。"),
                ("space", 18),
                ("preview", "【下期预告 · 金钱观系列 01】", "《巴菲特 99% 的钱，是 50 岁以后赚的》"),
                ("space", 18),
                ("question", "你立过最多次的 flag 是什么？坚持最久的一次有多久？")]),
        ]),

    dict(dir="小红书图文_复利_20260902", seriesName="书斋 · 金钱观系列", pal=PAPER3,
         cover=dict(art="vangogh_almond.jpg", badge2="复利 · 第 01 篇",
                    title=["巴菲特 99% 的钱，", "是 50 岁以后赚的"],
                    subtitle="时间，才是你最大的本金",
                    label="《盛开的杏花》· 梵高 · 1890 · 梵高博物馆"),
         pages=[
            dict(art="bruegel_cockaigne.jpg", region=None, h=500, label=COCKAIGNE, fname="行为清单", ops=[
                ("tag", "02 · 行为清单与内心独白"),
                ("title", "你着急赚钱的样子，恰恰在杀死复利", 40), ("space", 58),
                ("kai_b", "“这次翻倍我就收手，真的。”", 26), ("space", 42),
                ("items", [("追", "看到别人赚钱就冲进去：追热点、追风口、追涨停。"),
                           ("嫌", "看不上年化 15%，嫌太慢，想要三个月翻倍。"),
                           ("换", "账户全是进进出出，手续费和情绪一起吃掉本金。")]),
                ("space", 30),
                ("mono", "你缺的从来不是暴富的机会，\n而是愿意等复利爬过那段最平缓曲线的耐心——\n而大多数人，都在曲线起飞前下了车。")]),
            dict(art="starry_night.jpg", region=(0.30, 0.25, 0.85, 0.80), h=500, label=STAR, fname="机制解释", ops=[
                ("tag", "03 · 机制解释"),
                ("title", "复利的数学：前期像蜗牛，后期像火箭", 40), ("space", 40),
                ("body", "复利 = 本金 ×（1 + 收益率）^ 时间。前 70% 的时间都在爬坡，陡峭发生在最后——这是数学，不是玄学。"),
                ("space", 28),
                ("parts", [("① 时间 > 幅度", "年化 15% 坚持 40 年 ≈ 267 倍；年化 30% 只坚持 5 年 ≈ 3.7 倍。"),
                           ("② 大脑的盲区", "人不擅长指数思维，总觉得“最后那段”可以跳过。"),
                           ("③ 中断即归零", "复利最怕的不是慢，是中断和回撤。")]),
                ("space", 22),
                ("hook", "—— 那普通人没有本金，复利还有意义吗？")]),
            dict(art=None, fname="经典书证", ops=[
                ("tag", "04 · 经典书证"),
                ("title", "巴菲特的财富，大多来自“无聊”", 40), ("space", 40),
                ("book", "沃伦·巴菲特 · 查理·芒格", "伯克希尔·哈撒韦 · 长期持有", "广为流传的转述数据，仅供参考"),
                ("space", 22),
                ("body", "常被引用的说法：巴菲特绝大部分财富来自 60 岁之后——不是他老了才开窍，而是复利爬坡几十年，最后十年集中兑现。芒格的话更直白：诀窍不是频繁交易，是等待。"),
                ("space", 24),
                ("quote", "“钱生钱、复利滚动，才是普通人最可靠的伙伴。”", 25, "—— 芒格观点转述"),
                ("space", 16),
                ("body", "不构成投资建议。"),
                ("space", 18),
                ("hook", "—— 但“长期持有”听起来，怎么那么像“死扛”？")]),
            dict(art="rembrandt_self1659.jpg", region=(0.06, 0.05, 0.94, 0.75), h=460, label=REM, fname="双面剖析", ops=[
                ("tag", "05 · 双面剖析"),
                ("title", "复利思维，不是叫你死扛", 40), ("space", 36),
                ("lead", "不是死扛"),
                ("body", "前提是标的方向对、本身在增长——把垃圾扛成传家宝，那不叫复利，叫自我感动。"),
                ("space", 18),
                ("lead_b", "也不是万能"),
                ("body", "知识、健康、关系都能复利，但前提同样：方向对 + 持续投入 + 不中断。"),
                ("space", 24),
                ("lead", "我的真实经历（可换创始人真实经历）"),
                ("steps", [("① 以前：", "以为“长期持有”= 买了就装没看见，在下跌里自我感动。"),
                           ("② 后来明白：", "复利的前提是“对的东西”——先选对，再谈等。"),
                           ("③ 现在：", "每月定投一点，把注意力从 K 线挪回现金流。")]),
                ("space", 14),
                ("kai_end", "慢不是缺点；朝三暮四，才是复利最大的敌人。")]),
            dict(art="vermeer_milkmaid.jpg", region=(0.10, 0.10, 0.95, 0.85), h=500, label=MILK, fname="结尾", ops=[
                ("tag", "06 · 释然闭环"),
                ("title", "第一笔本金，今天就能存下", 40), ("space", 50),
                ("kai", "复利的第一笔本金，\n是今天就能存下的那一笔。", 30),
                ("space", 18), ("hairline",),
                ("action", "开一个只进不出的账户，发薪日先存 10%。"),
                ("space", 18),
                ("preview", "【下期预告 · 思维秩序系列 02】", "《不是算法困住你，是你自己点出来的茧》"),
                ("space", 18),
                ("question", "你坚持最久的一件事是什么？它给你“复利”了吗？")]),
        ]),

    dict(dir="小红书图文_信息茧房_20260902", seriesName="书斋 · 思维秩序系列", pal=PAPER4,
         cover=dict(art="caravaggio_narcissus.jpg", badge2="信息茧房 · 第 02 篇",
                    title=["不是算法困住你，", "是你自己点出来的茧"],
                    subtitle="你刷到的世界，是你一次次点击选出来的",
                    label="《那喀索斯》· 卡拉瓦乔 · 约1597 · 罗马国立古代艺术馆"),
         pages=[
            dict(art="anxiety.jpg", region=(0.05, 0.20, 0.95, 0.75), h=500, label=A, fname="行为清单", ops=[
                ("tag", "02 · 行为清单与内心独白"),
                ("title", "你的信息流里，全是你爱听的话", 40), ("space", 58),
                ("kai_b", "“为什么感觉全世界都跟我观点一致？”", 26), ("space", 42),
                ("items", [("点", "认同的观点秒赞收藏，不认同的划过拉黑。"),
                           ("聚", "群里全是同类人，一起说“外面的人都不懂”。"),
                           ("躲", "越看越觉得自己对，越觉得自己对，越不想看别的。")]),
                ("space", 30),
                ("mono", "算法没有绑架你，\n它只是把你每一次“我就爱看这个”记下来，\n然后给你造了一间永远附和你、永不抬杠的房间。")]),
            dict(art="bruegel_blind.jpg", region=None, h=500, label=BLIND, fname="机制解释", ops=[
                ("tag", "03 · 机制解释"),
                ("title", "茧不是算法织的，是你和算法一起织的", 38), ("space", 38),
                ("body", "“信息茧房”指人只听自己选择的信息、被自己的偏好包围——算法只是放大器，你的点击才是原料。"),
                ("space", 28),
                ("parts", [("① 确认偏误", "大脑偏爱支持自己的信息，排斥打脸的证据。"),
                           ("② 认知闭合", "不确定感让人难受，所以急着“想通”，然后拒绝再想。"),
                           ("③ 同质回响", "圈子里全是回声，慢慢把“观点”听成了“常识”。")]),
                ("space", 22),
                ("hook", "—— 那破茧，就是要逼自己天天看恶心的观点吗？")]),
            dict(art="duerer_jerome.jpg", region=(0.02, 0.10, 0.98, 0.62), h=500, label=DUR, fname="经典书证", ops=[
                ("tag", "04 · 经典书证"),
                ("title", "“信息茧房”这个词，2006 年就有了", 38), ("space", 40),
                ("book", "《信息乌托邦》", "凯斯·桑斯坦 · 2006 提出“信息茧房”概念", "中译：北京大学出版社"),
                ("space", 22),
                ("body", "桑斯坦指出：当人只接触自己选择的信息，意见会极化、判断会失真。2011 年帕里泽《过滤泡》进一步揭示：算法正在替你决定“你看不到什么”。"),
                ("space", 24),
                ("quote", "“你看到的世界，是你允许自己看到的世界。”", 25, "—— 概念转述"),
                ("space", 18),
                ("hook", "—— 承认茧是自己点的，是不是就破了一半？")]),
            dict(art="rembrandt_self1659.jpg", region=(0.06, 0.05, 0.94, 0.75), h=460, label=REM, fname="双面剖析", ops=[
                ("tag", "05 · 双面剖析"),
                ("title", "破茧，不是让你去看恶心观点", 38), ("space", 36),
                ("lead", "真正的破茧"),
                ("body", "是恢复“看到不同”的能力——不需要认同，只需要看见，然后自己判断。"),
                ("space", 18),
                ("lead_b", "防走火"),
                ("body", "天天泡在对立面里骂街，只是换了一个茧。"),
                ("space", 24),
                ("lead", "我的真实经历（可换创始人真实经历）"),
                ("steps", [("① 以前：", "取关所有不同意见的人，觉得世界终于清净了。"),
                           ("② 后来发现：", "清净的代价，是我把“猜测”当成了“事实”。"),
                           ("③ 现在：", "关注两个立场相反但讲逻辑的账号，只当镜子照。")]),
                ("space", 14),
                ("kai_end", "茧不是墙，是你亲手搭的回音壁——拆一块砖，天就透进来。")]),
            dict(art="friedrich_wanderer.jpg", region=(0.10, 0.05, 0.95, 0.62), h=500, label=WAN, fname="结尾", ops=[
                ("tag", "06 · 释然闭环"),
                ("title", "走出自己点出来的茧", 40), ("space", 48),
                ("kai", "真正的清醒，不是永远正确，\n而是知道自己可能错在哪里。", 30),
                ("space", 18), ("hairline",),
                ("action", "取关一个只让你舒服的同质账号，换一个讲证据的。"),
                ("space", 18),
                ("preview", "【下期预告 · 阿德勒系列 01】", "《别人怎么看你，真的跟你没关系》"),
                ("space", 18),
                ("question", "最近一次让你觉得“原来我一直想错了”的瞬间，是什么？")]),
        ]),
]

def main():
    for T in TOPICS:
        pkg = os.path.join(ROOT, T["dir"])
        os.makedirs(pkg, exist_ok=True)
        render_cover(pkg, T)
        for i, Pg in enumerate(T["pages"]):
            render_page(pkg, T, i + 2, Pg)
    print("BATCH DONE")

if __name__ == "__main__":
    main()
