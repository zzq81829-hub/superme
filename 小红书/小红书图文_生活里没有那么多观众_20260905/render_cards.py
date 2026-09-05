# -*- coding: utf-8 -*-
"""
书斋 · 小红书美术馆藏风图文渲染引擎 (V3 画报殿堂版)
课题：《生活里，没有那么多观众》——关于聚光灯效应与自我中心偏差的残酷自省
排版标准：严格对标 Image 2 黄金典范，微卡片独立分级包装、动态自适应高度绝不溢出、消除底部空白断层。
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
ASSETS = ROOT / "assets" / "studio"
FONTS = ASSETS / "fonts" / "sc" / "OTF" / "SimplifiedChinese"
IMAGES = ASSETS / "img"

W, H = 1080, 1440
M = 88
CW = W - 2 * M
FOOTER_Y = 1356

# 高级美术馆色板系统
PAPER = (246, 243, 235)           # 暖米白宣纸底色
INK = (34, 32, 30)                 # 主墨色
MUTED = (116, 108, 98)             # 展签灰褐
RED = (162, 42, 38)                # 经典朱砂红（穿透点睛）
GOLD = (168, 126, 68)              # 雅致古铜金
DEEP_GOLD = (136, 94, 38)          # 高对比度深金
BLUE = (48, 72, 94)                # 黛青石墨蓝
LINE = (218, 210, 196)             # 骨瓷极细分隔线
CARD_BG = (255, 255, 255, 205)     # 80% 半透明温润宣纸微卡层
CARD_BORDER = (216, 206, 188, 180) # 1px 极细浅金骨瓷边框

# 黄金锚定版面常量 (严格对标 Image 2)
START_Y = 485       # 内容微卡片起始 y 坐标
TAKEAWAY_Y = 1156   # 收底认知卡起始 y 坐标
TAKEAWAY_H = 126    # 收底认知卡高度 (底边缘 1282，距离底线 1338 精准保留 56px 呼吸间隙)

_NO_LEAD = set("，。、；：？！）」』】）’”“…—·…")
_NO_TAIL = set("（「『【《〈")


def get_font(weight="regular", size=28):
    names = {
        "heavy": "SourceHanSerifSC-Heavy.otf",
        "bold": "SourceHanSerifSC-Bold.otf",
        "semibold": "SourceHanSerifSC-SemiBold.otf",
        "medium": "SourceHanSerifSC-Medium.otf",
        "regular": "SourceHanSerifSC-Regular.otf",
        "light": "SourceHanSerifSC-Light.otf",
    }
    return ImageFont.truetype(str(FONTS / names[weight]), size)


def kai(size=32):
    return ImageFont.truetype("C:/Windows/Fonts/simkai.ttf", size)


def paper_background():
    base = Image.new("RGB", (W, H), PAPER)
    noise = Image.effect_noise((W, H), 9).convert("L")
    tint = Image.merge("RGB", (noise, noise, noise))
    return Image.blend(base, tint, 0.024)


def crop_fill(path, size, crop=(0, 0, 1, 1), desat=0.15, dark=0.0):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    x0, y0, x1, y1 = crop
    im = im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
    tw, th = size
    scale = max(tw / im.width, th / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.Resampling.LANCZOS)
    left, top = (im.width - tw) // 2, (im.height - th) // 2
    im = im.crop((left, top, left + tw, top + th))
    im = ImageEnhance.Color(im).enhance(1.0 - desat)
    if dark > 0.0:
        im = Image.blend(im, Image.new("RGB", im.size, (16, 15, 14)), dark)
    return im


def draw_text_tracking(draw, xy, text, fnt, fill, tracking=0.0):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        ch_w = draw.textlength(ch, font=fnt)
        x += ch_w + tracking
    return x


def wrap_text_cjk(draw, text, fnt, max_width, tracking=0.0):
    """
    符合中文排版规则（避头尾标点、悬挂标点）的自动折行函数
    """
    lines = []
    for paragraph in text.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        cur = ""
        for ch in paragraph:
            test_line = cur + ch
            w = sum(draw.textlength(c, font=fnt) + tracking for c in test_line) - (tracking if test_line else 0)
            if w <= max_width:
                cur = test_line
            else:
                if ch in _NO_LEAD and cur:
                    cur = test_line
                elif cur and cur[-1] in _NO_TAIL:
                    cur = test_line
                else:
                    lines.append(cur)
                    cur = ch
        if cur:
            lines.append(cur)
    return lines


def footer(draw, n):
    draw.line((M, FOOTER_Y - 18, W - M, FOOTER_Y - 18), fill=LINE, width=1)
    tag = "书斋 · 深度思考系列"
    draw.text((M, FOOTER_Y), tag, font=get_font("regular", 18), fill=MUTED)
    label = f"0{n} / 06"
    fw = draw.textlength(label, font=get_font("medium", 18))
    draw.text((W - M - fw, FOOTER_Y), label, font=get_font("medium", 18), fill=MUTED)


def draw_painting_band(im, img_name, crop_box, band_h=320, plaque_text="", desat=0.15, dark=0.05):
    """
    绘制顶部名画全宽画带，并在右下角附上微胶囊艺术展签
    """
    band_img = crop_fill(IMAGES / img_name, (W, band_h), crop=crop_box, desat=desat, dark=dark)
    im.paste(band_img, (0, 0))

    d = ImageDraw.Draw(im)
    d.line((0, band_h, W, band_h), fill=LINE, width=1)

    if plaque_text:
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d_ov = ImageDraw.Draw(ov)
        fnt = get_font("regular", 15)
        pw = d_ov.textlength(plaque_text, font=fnt)
        px0 = W - M - pw - 24
        py0 = band_h - 36
        d_ov.rounded_rectangle((px0, py0, W - M, py0 + 26), 6, fill=(16, 15, 14, 165))
        draw_text_tracking(d_ov, (px0 + 12, py0 + 5), plaque_text, fnt, (235, 230, 220, 240), tracking=1.0)
        im = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")

    return im, band_h


def draw_lead_card(im, x, y, w, title, text, accent_color=BLUE, min_h=0):
    """
    导语微卡片：左侧带 8px 实体圆角色条，全幅包裹。
    自适应动态计算高度，保证文本安全容纳，绝不溢出。
    """
    d_measure = ImageDraw.Draw(im)
    title_fnt = get_font("bold", 23)
    body_fnt = get_font("regular", 24)
    tracking_t = 2.0
    tracking_b = 1.2

    text_w = w - 72
    lines = wrap_text_cjk(d_measure, text, body_fnt, text_w, tracking=tracking_b)

    pad_top = 24
    pad_bottom = 24
    inner_gap = 14 if title else 0
    title_h = 28 if title else 0
    line_step = 38
    body_h = len(lines) * line_step
    calc_h = pad_top + title_h + inner_gap + body_h + pad_bottom
    h = max(min_h, calc_h)

    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    d.rounded_rectangle((x, y, x + w, y + h), 14, fill=CARD_BG, outline=CARD_BORDER, width=1)
    d.rounded_rectangle((x, y, x + 8, y + h), radius=14, fill=accent_color)
    d.rectangle((x + 4, y, x + 8, y + h), fill=accent_color)

    comp = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
    d_comp = ImageDraw.Draw(comp)

    cur_ty = y + pad_top
    if title:
        draw_text_tracking(d_comp, (x + 36, cur_ty), title, title_fnt, accent_color, tracking=tracking_t)
        cur_ty += title_h + inner_gap
    for ln in lines:
        draw_text_tracking(d_comp, (x + 36, cur_ty), ln, body_fnt, INK, tracking=tracking_b)
        cur_ty += line_step

    return comp, h


def draw_component_card(im, x, y, w, title, text, accent_color=BLUE, title_color=None, min_h=0):
    """
    标准分项微卡片（完美对标 Image 2）：
    微卡片内嵌左侧垂直胶囊色条 (Pill)，标题与正文规整对齐，高度自适应计算。
    """
    d_measure = ImageDraw.Draw(im)
    title_fnt = get_font("bold", 23)
    body_fnt = get_font("regular", 23)
    tracking_t = 1.8
    tracking_b = 1.2

    t_col = title_color if title_color else INK
    text_w = w - 82
    lines = wrap_text_cjk(d_measure, text, body_fnt, text_w, tracking=tracking_b)

    pad_top = 22
    pad_bottom = 22
    inner_gap = 12
    title_h = 28
    line_step = 36
    body_h = len(lines) * line_step
    calc_h = pad_top + title_h + inner_gap + body_h + pad_bottom
    h = max(min_h, calc_h)

    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    d.rounded_rectangle((x, y, x + w, y + h), 14, fill=CARD_BG, outline=CARD_BORDER, width=1)

    pill_top = y + 20
    pill_bottom = y + h - 20
    d.rounded_rectangle((x + 20, pill_top, x + 26, pill_bottom), radius=3, fill=accent_color)

    comp = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
    d_comp = ImageDraw.Draw(comp)

    cur_ty = y + pad_top
    draw_text_tracking(d_comp, (x + 44, cur_ty), title, title_fnt, t_col, tracking=tracking_t)
    cur_ty += title_h + inner_gap
    for ln in lines:
        draw_text_tracking(d_comp, (x + 44, cur_ty), ln, body_fnt, MUTED if t_col == INK else INK, tracking=tracking_b)
        cur_ty += line_step

    return comp, h


def draw_takeaway_card(im, x, y, w, h, category_text, quote_text, accent_color=DEEP_GOLD):
    """
    底部专属核心认知收底卡：
    高度 >= 118px，双层架构，左侧 8px 质感厚条，牢牢压实下半版重心
    """
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    d.rounded_rectangle((x, y, x + w, y + h), 14, fill=(255, 253, 246, 235), outline=(206, 192, 172, 230), width=1)
    d.rounded_rectangle((x, y, x + 8, y + h), radius=14, fill=accent_color)
    d.rectangle((x + 4, y, x + 8, y + h), fill=accent_color)

    draw_text_tracking(d, (x + 36, y + 22), f"· {category_text} ·", get_font("bold", 20), accent_color, tracking=3.0)
    draw_text_tracking(d, (x + 36, y + 64), quote_text, kai(33), INK, tracking=1.5)

    comp = Image.alpha_composite(im.convert("RGBA"), ov)
    return comp.convert("RGB")


def render_page1():
    """第 1 页：残酷事实封面 (Narcissus 全幅油画 + 双层标题强化卡)"""
    bg = crop_fill(IMAGES / "caravaggio_narcissus.jpg", (W, H), crop=(0.02, 0.05, 0.98, 0.95), desat=0.05, dark=0.15)
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # 左上浮动奶油信息卡
    d.rounded_rectangle((M, 80, M + 340, 180), 16, fill=(248, 245, 238, 235), outline=(180, 162, 138, 255), width=1)
    draw_text_tracking(d, (M + 30, 102), "书斋 · 心理认知", get_font("bold", 23), (48, 44, 40, 255), tracking=2.0)
    draw_text_tracking(d, (M + 30, 138), "SPOTLIGHT EFFECT / 01", get_font("medium", 16), RED, tracking=1.5)

    # 主标题深暖半透明圆角加强卡 (大标题 Heavy 102pt，居中且极度醒目)
    card_y0, card_y1 = 400, 810
    d.rounded_rectangle((M, card_y0, W - M, card_y1), 24, fill=(18, 17, 16, 232), outline=(138, 116, 88, 180), width=1)

    title_font = get_font("heavy", 102)
    t1 = "生活里，"
    t2 = "没有那么多观众。"
    w1 = d.textlength(t1, font=title_font)
    w2 = d.textlength(t2, font=title_font)

    d.text(((W - w1) / 2, card_y0 + 58), t1, font=title_font, fill=(250, 247, 240, 255))
    d.text(((W - w2) / 2, card_y0 + 196), t2, font=title_font, fill=(250, 247, 240, 255))
    d.line(((W - 320) / 2, card_y0 + 338, (W + 320) / 2, card_y0 + 338), fill=(184, 52, 46, 255), width=4)

    # 底部半透暗底收尾栏
    d.rounded_rectangle((M, 1200, W - M, 1356), 18, fill=(16, 15, 14, 210), outline=(100, 90, 78, 150), width=1)
    d.text((M + 36, 1234), "最累的不是没人看你，是你以为全场都在盯你", font=get_font("bold", 29), fill=(250, 246, 238, 255))
    d.text((M + 36, 1290), "卡拉瓦乔《那喀索斯》· 1599 · 罗马国立古代艺术美术馆", font=get_font("regular", 20), fill=(195, 182, 166, 255))

    final_im = Image.alpha_composite(bg.convert("RGBA"), ov).convert("RGB")
    final_im.save(HERE / "01_封面.png", quality=95)


def render_page2():
    """第 2 页：行为清单 (Munch Anxiety 画带 + 导语微卡 + 3 场景微卡 + 底部独白卡)"""
    im = paper_background()
    im, band_h = draw_painting_band(
        im, "anxiety.jpg", crop_box=(0.0, 0.08, 1.0, 0.88),
        band_h=320, plaque_text="蒙克《不安》· 1894 · 奥斯陆", desat=0.18, dark=0.05
    )

    d = ImageDraw.Draw(im)
    cur_y = band_h + 38
    draw_text_tracking(d, (M, cur_y), "02 · 行 为 清 单", get_font("bold", 21), RED, tracking=3.0)
    cur_y += 32
    draw_text_tracking(d, (M, cur_y), "你每天在给多少假想的观众表演？", get_font("heavy", 45), INK, tracking=2.5)

    cur_y = START_Y

    # 导语卡 (136px)
    lead_text = "生活里最隐蔽的内耗，不是外界的刁难，而是内心的剧场：\n你以为聚光灯打在自己身上，其实台下空无一人。"
    im, h_lead = draw_lead_card(im, M, cur_y, CW, "", lead_text, accent_color=DEEP_GOLD, min_h=136)
    cur_y += h_lead + 44

    # 3 个场景微卡片 (各 122px)
    items = [
        ("① 消失的动态", "发完朋友圈 5 分钟切回来看 8 次，没人点赞就想悄悄删掉。", RED),
        ("② 深夜精神审讯", "开会讲错半句话，晚上躺在床上像倒带一样反复自责两小时。", BLUE),
        ("③ 停滞的尝试", "想换赛道、想做新尝试，第一念头永远是“熟人看到会怎么笑我”。", DEEP_GOLD),
    ]

    for i, (title, desc, col) in enumerate(items):
        im, h_card = draw_component_card(im, M, cur_y, CW, title, desc, accent_color=col, title_color=INK, min_h=122)
        cur_y += h_card + (38 if i < len(items) - 1 else 0)

    # 底部专属收底认知卡 (严格锚定在 TAKEAWAY_Y)
    im = draw_takeaway_card(
        im, M, TAKEAWAY_Y, CW, TAKEAWAY_H,
        category_text="羞 耻 内 心 独 白 揭 穿",
        quote_text="“等我有一天做出大成绩，他们一定会后悔。”",
        accent_color=RED
    )

    d = ImageDraw.Draw(im)
    footer(d, 2)
    im.save(HERE / "02_行为清单.png", quality=95)


def render_page3():
    """第 3 页：机制解释 (Narcissus 水面画带 + 人话定义卡 + 3 部件微卡 + 底部核心认知卡 - 完美对标 Image 2)"""
    im = paper_background()
    im, band_h = draw_painting_band(
        im, "caravaggio_narcissus.jpg", crop_box=(0.15, 0.45, 0.85, 0.98),
        band_h=320, plaque_text="卡拉瓦乔《那喀索斯》（倒影局部）· 1599", desat=0.15, dark=0.08
    )

    d = ImageDraw.Draw(im)
    cur_y = band_h + 38
    draw_text_tracking(d, (M, cur_y), "03 · 机 制 解 释", get_font("bold", 21), GOLD, tracking=3.0)
    cur_y += 32
    draw_text_tracking(d, (M, cur_y), "聚光灯效应：你把自己想得太重要了", get_font("heavy", 45), INK, tracking=2.5)

    cur_y = START_Y

    # 导语卡：人话定义 (148px)
    desc1 = "人类普遍会严重高估周围人对自己外表、言行和失误的注意程度。\n你误以为头顶有盏无形的强光，时刻照着你的窘态。"
    im, h_lead = draw_lead_card(im, M, cur_y, CW, "人话定义 · 聚光灯效应 (Spotlight Effect)", desc1, accent_color=RED, min_h=148)
    cur_y += h_lead + 44

    # 3 个核心部件独立微卡片 (对标 Image 2 的 ①快直觉 ②懒监督 ③事后找补，各 120px)
    parts = [
        ("① 自我中心偏差", "生活在自己的第一视角里，误以为全世界也在以你为中心同步直播。", BLUE, INK),
        ("② 透明度错觉", "以为自己的慌乱和失误全写在脸上，其实别人根本察觉不到内心的波澜。", BLUE, INK),
        ("③ 焦点归因谬误", "把别人随意的移开视线，脑补成对自己能力或形象的无声审判。", RED, RED),
    ]

    for i, (p_title, p_desc, col, t_col) in enumerate(parts):
        im, h_part = draw_component_card(im, M, cur_y, CW, p_title, p_desc, accent_color=col, title_color=t_col, min_h=120)
        cur_y += h_part + (36 if i < len(parts) - 1 else 0)

    # 底部专属核心认知卡 (严格锚定在 TAKEAWAY_Y)
    im = draw_takeaway_card(
        im, M, TAKEAWAY_Y, CW, TAKEAWAY_H,
        category_text="核 心 认 知",
        quote_text="“不是全场都在盯你，而是每个人都在忙着看自己。”",
        accent_color=DEEP_GOLD
    )

    d = ImageDraw.Draw(im)
    footer(d, 3)
    im.save(HERE / "03_心理学解释.png", quality=95)


def render_page4():
    """第 4 页：权威书证 (Durer Jerome 画带 + 实验设计导语卡 + 2 项科学与书证微卡 + 底部事实底牌卡)"""
    im = paper_background()
    im, band_h = draw_painting_band(
        im, "duerer_jerome.jpg", crop_box=(0.05, 0.1, 0.95, 0.85),
        band_h=320, plaque_text="丢勒《书房中的圣杰罗姆》· 1514", desat=0.18, dark=0.04
    )

    d = ImageDraw.Draw(im)
    cur_y = band_h + 38
    draw_text_tracking(d, (M, cur_y), "04 · 权 威 书 证", get_font("bold", 21), DEEP_GOLD, tracking=3.0)
    cur_y += 32
    draw_text_tracking(d, (M, cur_y), "康奈尔大学 2000 年经典实验", get_font("heavy", 45), INK, tracking=2.5)

    cur_y = START_Y

    # 导语卡：实验过程与数据 (196px)
    exp_text = (
        "· 实验设计：让受试学生穿上印有通俗歌手滑稽头像的 T 恤走进满座教室。\n"
        "· 预估比例：穿衣服的学生预估至少 50% 的人会注意到他的窘态。\n"
        "· 真实结果：事后全员独立测算，真正抬头注意到的只有 23%。"
    )
    im, h_lead = draw_lead_card(im, M, cur_y, CW, "托马斯·季洛维奇团队 · 尴尬 T 恤实验 (2000)", exp_text, accent_color=DEEP_GOLD, min_h=196)
    cur_y += h_lead + 52

    # 微卡片 1：科学结论 (120px)
    im, h_c1 = draw_component_card(
        im, M, cur_y, CW,
        "① 科学结论 · 关注度虚高一倍以上",
        "人类对外界投向自己的目光与评价，存在系统性、成倍的过度预估。",
        accent_color=BLUE, title_color=INK, min_h=120
    )
    cur_y += h_c1 + 52

    # 微卡片 2：经典著作戴维·迈尔斯名言（动态计算高度，绝对严禁文字溢出！196px）
    book_quote = (
        "“我们将自己视为一切事情的中心，因而过高估计他人对我们行为的警觉度。\n"
        "现实是残酷也仁慈的：生活里没有那么多观众。”\n"
        "出处：人民邮电出版社 · ISBN 9787115413000"
    )
    im, h_c2 = draw_component_card(
        im, M, cur_y, CW,
        "② 戴维·迈尔斯《社会心理学》（第 11 版 · 第 2 章）",
        book_quote,
        accent_color=RED, title_color=RED, min_h=196
    )

    # 底部专属收底认知卡 (严格锚定在 TAKEAWAY_Y)
    im = draw_takeaway_card(
        im, M, TAKEAWAY_Y, CW, TAKEAWAY_H,
        category_text="事 实 底 牌",
        quote_text="“你记了一辈子的丢脸瞬间，别人两秒钟就忘了。”",
        accent_color=DEEP_GOLD
    )

    d = ImageDraw.Draw(im)
    footer(d, 4)
    im.save(HERE / "04_书证.png", quality=95)


def render_page5():
    """第 5 页：双面剖析 (Rembrandt 1659 画带 + 机制导语卡 + 3 真实故事微卡 + 底部顿悟卡 - 彻底消灭文本溢出)"""
    im = paper_background()
    im, band_h = draw_painting_band(
        im, "rembrandt_self1659.jpg", crop_box=(0.08, 0.05, 0.92, 0.85),
        band_h=320, plaque_text="伦勃朗《1659自画像》· 伦敦国家美术馆", desat=0.15, dark=0.06
    )

    d = ImageDraw.Draw(im)
    cur_y = band_h + 38
    draw_text_tracking(d, (M, cur_y), "05 · 双 面 剖 析", get_font("bold", 21), BLUE, tracking=3.0)
    cur_y += 32
    draw_text_tracking(d, (M, cur_y), "“被注视感”既是牢笼，也是燃料", get_font("heavy", 45), INK, tracking=2.5)

    cur_y = START_Y

    # 导语卡：双面机制 (152px)
    analysis = (
        "· 适度感知：维系基本社会体面，让人不至于肆无忌惮、滑向傲慢。\n"
        "· 过度放大的代价：把假想观众当成人生法官，每一个动作都在表演中变形。"
    )
    im, h_lead = draw_lead_card(im, M, cur_y, CW, "机制剖析 · 为什么它既有用又危险？", analysis, accent_color=BLUE, min_h=152)
    cur_y += h_lead + 42

    # 拆解「我」的真实经历为 3 个精练叙事微卡（每条 1 行，各 120px，绝不溢出也绝不产生单字孤行！）
    story_beats = [
        ("① 翻车现场 · 2024 年秋天的一次公开提案", "翻页笔失灵，现场卡顿 10 秒。下台后我万念俱灰，觉得专业形象全毁了。", BLUE, INK),
        ("② 半年后复盘 · 对方甚至记不清是谁讲的", "半年后聚餐聊起，对方只记得核心方案预算合理，完全忘了那 10 秒卡顿。", DEEP_GOLD, INK),
        ("③ 隐秘自恋的揭穿 · 恐惧背后的心理真相", "那一刻我才明白：我不是害怕失误，而是贪恋“自己必须完美”的隐秘自恋。", RED, RED),
    ]

    for i, (b_title, b_desc, col, t_col) in enumerate(story_beats):
        im, h_beat = draw_component_card(im, M, cur_y, CW, b_title, b_desc, accent_color=col, title_color=t_col, min_h=120)
        cur_y += h_beat + (36 if i < len(story_beats) - 1 else 0)

    # 底部专属核心认知卡 (严格锚定在 TAKEAWAY_Y)
    im = draw_takeaway_card(
        im, M, TAKEAWAY_Y, CW, TAKEAWAY_H,
        category_text="顿 悟 升 华",
        quote_text="“承认自己不重要，是精神自由的第一步。”",
        accent_color=RED
    )

    d = ImageDraw.Draw(im)
    footer(d, 5)
    im.save(HERE / "05_双面剖析.png", quality=95)


def render_page6():
    """第 6 页：释然升华 (Friedrich Wanderer 画带 + 导语卡 + 3 松绑动作微卡 + 留白金句收底卡)"""
    im = paper_background()
    im, band_h = draw_painting_band(
        im, "friedrich_wanderer.jpg", crop_box=(0.1, 0.05, 0.9, 0.85),
        band_h=320, plaque_text="弗里德里希《雾海上的旅人》· 1818 · 汉堡", desat=0.18, dark=0.06
    )

    d = ImageDraw.Draw(im)
    cur_y = band_h + 38
    draw_text_tracking(d, (M, cur_y), "06 · 释 然 升 华", get_font("bold", 21), RED, tracking=3.0)
    cur_y += 32
    draw_text_tracking(d, (M, cur_y), "从今天起，关掉假想的聚光灯", get_font("heavy", 45), INK, tracking=2.5)

    cur_y = START_Y

    # 导语卡 (140px)
    im, h_lead = draw_lead_card(
        im, M, cur_y, CW,
        "关掉聚光灯 · 把精力还给真实的生活",
        "生活不是全天候直播的舞台，没有人在给你打分。\n今晚开始，试试这三个松绑动作：",
        accent_color=DEEP_GOLD, min_h=140
    )
    cur_y += h_lead + 46

    # 3 个动作微卡片 (各 120px)
    actions = [
        ("① 想发的动态直接发", "没人带着放大镜打量你的生活。按下发送 3 秒后，就可以放下了。", RED),
        ("② 说话磕绊别反复倒带", "散会后每个人都在想自己待会吃什么，没人有空重播你的发言。", BLUE),
        ("③ 允许自己彻底搞砸", "在假想的聚光灯下是毁灭，在现实里不过是一次低成本的试错。", DEEP_GOLD),
    ]

    for i, (a_title, a_desc, col) in enumerate(actions):
        im, h_act = draw_component_card(im, M, cur_y, CW, a_title, a_desc, accent_color=col, title_color=INK, min_h=120)
        cur_y += h_act + (38 if i < len(actions) - 1 else 0)

    # 底部专属核心认知卡 (严格锚定在 TAKEAWAY_Y)
    im = draw_takeaway_card(
        im, M, TAKEAWAY_Y, CW, TAKEAWAY_H,
        category_text="书 斋 留 白",
        quote_text="“生活里没有那么多观众。下期预告：《被讨厌的勇气》”",
        accent_color=DEEP_GOLD
    )

    d = ImageDraw.Draw(im)
    footer(d, 6)
    im.save(HERE / "06_释然升华.png", quality=95)


def render_contact_sheet():
    """生成 00_六页总览.png 拼图"""
    names = ["01_封面.png", "02_行为清单.png", "03_心理学解释.png", "04_书证.png", "05_双面剖析.png", "06_释然升华.png"]
    sheet = Image.new("RGB", (1140, 1060), (28, 26, 24))
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        thumb = Image.open(HERE / name).resize((320, 427), Image.Resampling.LANCZOS)
        x = 50 + (i % 3) * 365
        y = 48 + (i // 3) * 500
        sheet.paste(thumb, (x, y))
        d.text((x + 8, y + 438), name, font=get_font("regular", 17), fill=(235, 228, 216))
    sheet.save(HERE / "00_六页总览.png", quality=95)


if __name__ == "__main__":
    print("Re-rendering 6 cards with perfected golden geometry...")
    render_page1()
    print("Page 1 rendered.")
    render_page2()
    print("Page 2 rendered.")
    render_page3()
    print("Page 3 rendered.")
    render_page4()
    print("Page 4 rendered.")
    render_page5()
    print("Page 5 rendered.")
    render_page6()
    print("Page 6 rendered.")
    render_contact_sheet()
    print("Flawless re-rendering complete!")
