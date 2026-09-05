# -*- coding: utf-8 -*-
"""
小红书图文引擎 —— 西方经典名画智能选择与防审美疲劳轮转系统
根据选题情绪、哲学主题智能匹配名画，并根据历史使用记录自动规避近期重复使用的作品。
"""
import os
import json
import random
from datetime import datetime

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CATALOG = os.path.join(ROOT_DIR, "assets", "studio", "art_library.json")
DEFAULT_HISTORY = os.path.join(ROOT_DIR, "data", "content", "art_usage_history.json")

def load_catalog(path=DEFAULT_CATALOG):
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[art_selector] Warning: Failed to load art catalog: {e}")
        return []

def load_history(path=DEFAULT_HISTORY):
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def record_usage(artwork_id, note_id="", path=DEFAULT_HISTORY):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    history = load_history(path)
    history.append({
        "artworkId": artwork_id,
        "noteId": note_id,
        "usedAt": datetime.utcnow().isoformat() + "Z"
    })
    # Keep last 100 entries
    trimmed = history[-100:]
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(trimmed, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[art_selector] Warning: Failed to write history: {e}")

def get_recent_artwork_ids(limit=4, path=DEFAULT_HISTORY):
    history = load_history(path)
    recent = [h["artworkId"] for h in history[-limit:] if "artworkId" in h]
    # Unique preserve order
    seen = set()
    return [x for x in recent if not (x in seen or seen.add(x))]

def get_artwork_by_id(art_id, catalog_path=DEFAULT_CATALOG):
    catalog = load_catalog(catalog_path)
    for item in catalog:
        if item.get("id") == art_id or item.get("filename") == art_id:
            return item
    return None

def select_artwork(theme="", intent="", note_id="", cooldown_count=4, catalog_path=DEFAULT_CATALOG, history_path=DEFAULT_HISTORY):
    """
    智能选择与防审美疲劳轮转：
    1. 根据 theme / intent 进行多维度关键词打分匹配
    2. 剔除最近 cooldown_count 篇使用过的名画
    3. 在最高分候选中做随机加权轮换，保持新鲜度
    4. 自动记录本次使用到历史账本
    """
    catalog = load_catalog(catalog_path)
    if not catalog:
        return None

    query_text = f"{theme} {intent}".lower().strip()
    recent_ids = get_recent_artwork_ids(limit=cooldown_count, path=history_path)

    candidates = catalog
    if query_text:
        scored = []
        tokens = [t for t in query_text.split() if t]
        for item in catalog:
            searchable = " ".join([
                item.get("title", ""),
                item.get("artist", ""),
                item.get("movement", ""),
                item.get("mood", ""),
                " ".join(item.get("themes", []))
            ]).lower()
            score = sum(1 for token in tokens if token in searchable)
            if score > 0:
                scored.append((item, score))

        if scored:
            scored.sort(key=lambda x: x[1], reverse=True)
            max_score = scored[0][1]
            # Keep items with score >= max_score - 1
            candidates = [x[0] for x in scored if x[1] >= max(1, max_score - 1)]

    # Filter out recent cooldown IDs
    fresh = [c for c in candidates if c.get("id") not in recent_ids]
    pool = fresh if fresh else candidates

    chosen = random.choice(pool[:min(4, len(pool))])

    if note_id:
        record_usage(chosen.get("id"), note_id, history_path)

    return chosen

if __name__ == "__main__":
    import sys
    print("=== Testing Western Art Selector ===")
    themes = ["疏离 虚无", "孤独 探索", "专注 秩序", "自由 释然", "自省 哲学"]
    for th in themes:
        res = select_artwork(theme=th)
        print(f"Theme: [{th}] -> {res['title']} by {res['artist']} ({res['filename']})")
