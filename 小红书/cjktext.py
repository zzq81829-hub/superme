# -*- coding: utf-8 -*-
"""
cjktext —— 中文排版层：避头尾标点 + 中西文混排细空格 + 悬挂标点。
wrap() 与各引擎原 wrap 签名一致：(d, text, x, y, max_w, font, fill, spacing)
"""
import re

# 禁行首标点（行首不得出现 → 悬挂到上一行行尾）
_NO_LEAD = set("，。、；：？！）」』】）’”“…—·…")
# 行尾禁放的开始符号（拆行时若落在行尾则主动移到下一行）
_NO_TAIL = set("（「『【《〈")

_CJK = "\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff"
_EXT = "\u3000-\u303f\uff00-\uffef"
_MIX1 = re.compile(f"([{_CJK}{_EXT}])([A-Za-z0-9])")
_MIX2 = re.compile(f"([A-Za-z0-9])([{_CJK}{_EXT}])")

_THIN = " "  # ASCII 空格≈0.24em，正好是中文排版中西文间距标准（U+2009 思源字体缺失）

def mixspace(text):
    """中英文/数字之间插入细空格：巴菲特99% → 巴菲特 99%。"""
    t = _MIX1.sub(lambda m: m.group(1) + _THIN + m.group(2), text)
    t = _MIX2.sub(lambda m: m.group(1) + _THIN + m.group(2), t)
    return t

def wrap(d, text, x, y, max_w, font, fill, spacing=1.6):
    """自动换行（中文按字切分）+ 避头尾 + 悬挂标点 + 中西文细空格。返回下一行 y。"""
    lines = []
    for para in mixspace(text).split("\n"):
        if not para:
            lines.append("")
            continue
        cur = ""
        for ch in para:
            if d.textlength(cur + ch, font=font) <= max_w:
                cur += ch
            else:
                if ch in _NO_LEAD and cur:
                    # 禁行首标点：并入上一行（允许轻微悬挂）
                    cur += ch
                elif cur and cur[-1] in _NO_TAIL:
                    # 行尾不得放开始符号：先收下，下一轮再看
                    cur += ch
                else:
                    lines.append(cur)
                    cur = ch
        lines.append(cur)

    # 二次规整：行首若还是禁标点（极端情况），前移
    cleaned = []
    for ln in lines:
        while ln and ln[0] in _NO_LEAD and cleaned:
            cleaned[-1] += ln[0]
            ln = ln[1:]
        cleaned.append(ln)
    lines = cleaned

    step = int(font.size * spacing)
    for ln in lines:
        if ln:
            d.text((x, y), ln, font=font, fill=fill)
        y += step
    return y
