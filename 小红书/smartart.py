# -*- coding: utf-8 -*-
"""
smartart —— 智能裁切：自动找到名画中"最重要的画面"（人脸优先，其次显著区域），
返回适配画带宽高比（aspect）的裁切窗口，保证主角完整、画面填满、不切脸。
"""
import numpy as np
from PIL import Image, ImageFilter

_FACE_CASCADE = None

def _load_cascade():
    global _FACE_CASCADE
    if _FACE_CASCADE is None:
        try:
            import cv2
            _FACE_CASCADE = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        except Exception:
            _FACE_CASCADE = False
    return _FACE_CASCADE

def _detect_faces(img):
    """返回像素坐标人脸框 [(x,y,w,h), ...]，失败/无人返回 []。"""
    cas = _load_cascade()
    if not cas:
        return []
    try:
        import cv2
        arr = np.asarray(img.convert("RGB"))[:, :, ::-1]
        gray = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY)
        mn = max(28, int(min(gray.shape) / 25))
        faces = cas.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=6, minSize=(mn, mn))
        return [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in faces]
    except Exception:
        return []

def _saliency_map(img):
    """频率显著图（模糊差分），返回 (map01, w, h)。"""
    g = img.convert("L").filter(ImageFilter.GaussianBlur(5))
    a = np.asarray(img.convert("L"), dtype=np.float32)
    b = np.asarray(g, dtype=np.float32)
    s = np.abs(a - b)
    s = (s - s.min()) / (s.max() - s.min() + 1e-6)
    return s

def smart_band_crop(img, hint, aspect):
    """对整幅画给出裁窗 (x0,y0,x1,y1)，使宽高比 = aspect，且主角（人脸/显著区）完整居中。
    hint: 软提示区域 (0-1 相对坐标) 或 None。"""
    w, h = img.size
    if hint:
        wx0, wy0, wx1, wy1 = [int(hint[i] * (w if i % 2 == 0 else h)) for i in range(4)]
        wx0, wy0 = max(0, wx0), max(0, wy0)
        wx1, wy1 = min(w, wx1), min(h, wy1)
    else:
        wx0, wy0, wx1, wy1 = 0, 0, w, h

    faces = _detect_faces(img)
    cand = [f for f in faces
            if f[0] >= wx0 - 0.15 * w and f[0] + f[2] <= wx1 + 0.15 * w
            and f[1] >= wy0 - 0.15 * h and f[1] + f[3] <= wy1 + 0.15 * h]
    if cand:
        fx, fy, fw, fh = max(cand, key=lambda f: f[2] * f[3])
        cx, cy = fx + fw / 2, fy + fh / 2
        vspan = fh * 2.1
        hspan = vspan * aspect
        if hspan > w:
            hspan = w
            vspan = w / aspect
    else:
        s = _saliency_map(img)
        sub = s[wy0:wy1, wx0:wx1]
        ys, xs = np.where(sub > (sub.mean() + 0.9 * sub.std()))
        if len(xs) > 60:
            cx, cy = wx0 + float(xs.mean()), wy0 + float(ys.mean())
        else:
            cx, cy = (wx0 + wx1) / 2, (wy0 + wy1) / 2
        # 构图先验：竖幅人像画（高>宽）人物头部集中在画面上部 1/3 带，
        # 直接把锚点放到头部带，避免裁掉脸；横画/风景则信任显著区。
        if w < h:
            cy = 0.36 * h
        vspan = h * 0.62
        hspan = vspan * aspect
        if hspan > w:
            hspan = w
            vspan = w / aspect
    x0 = int(cx - hspan / 2)
    x0 = max(0, min(x0, w - int(hspan)))
    y0 = int(cy - vspan / 2)
    y0 = max(0, min(y0, h - int(vspan)))
    return (x0, y0, x0 + int(hspan), y0 + int(vspan))
