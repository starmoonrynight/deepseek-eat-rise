#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
tools/prep-art.py —— 把 assets/ 里的立绘处理成游戏可直接用的精灵图

做的事：
  1) 从四边做"与边缘同色"的洪水填充，抠掉不透明背景（透明底的图会跳过）
  2) 边缘做轻微羽化，避免锯齿
  3) 裁到角色外框并留 3% 边距（游戏按高度 1.06 格缩放，裁过才不会偏小）
  4) 限制长边不超过 --max（默认 512），减小仓库体积

用法：
    python tools/prep-art.py                 # 处理 assets/fish.png 与 assets/fish_bowl.png
    python tools/prep-art.py 我的图.png       # 处理指定文件（原地覆盖，先备份 .bak）
"""
import os
import sys
from collections import deque

from PIL import Image, ImageFilter

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")


def alpha_extrema(im):
    if im.mode != "RGBA":
        return None
    return im.getchannel("A").getextrema()


def dist(c, d):
    dr = c[0] - d[0]
    dg = c[1] - d[1]
    db = c[2] - d[2]
    return (dr * dr + dg * dg + db * db) ** 0.5


def key_out_background(im, tol=46):
    """从四边洪水填充去背景。

    判定为背景的条件（满足其一）：
      · 与"边缘中位色"的 RGB 距离 < tol      —— 吃掉整片纯色/渐变背景
      · 与"来时那个像素"的距离 < tol          —— 允许背景本身有明暗渐变
    两条件都是"从边缘蔓延"的，角色内部同色区域不会被误伤。
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    border = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + \
             [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    vals = [px[x, y] for (x, y) in border if px[x, y][3] > 8]
    if not vals:
        return im, 0.0
    med = (sorted(v[0] for v in vals)[len(vals) // 2],
           sorted(v[1] for v in vals)[len(vals) // 2],
           sorted(v[2] for v in vals)[len(vals) // 2])

    def dist2(c, d):
        return dist(c, d)

    seen = bytearray(w * h)
    dq = deque()
    for (x, y) in border:
        i = y * w + x
        if not seen[i]:
            seen[i] = 1
            dq.append((x, y))

    removed = 0
    total = w * h
    while dq:
        x, y = dq.popleft()
        c = px[x, y]
        if c[3] == 0:
            kill = True
        else:
            kill = (dist(c, med) < tol)
        if kill:
            if c[3] != 0:
                px[x, y] = (c[0], c[1], c[2], 0)
                removed += 1
        else:
            continue
        for (nx, ny) in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if seen[i]:
                    continue
                seen[i] = 1
                if px[nx, ny][3] > 8 and dist(px[nx, ny], c) >= tol and dist(px[nx, ny], med) >= tol:
                    continue            # 颜色突变 → 这里是角色边缘，不要越过去
                dq.append((nx, ny))
    return im, removed / float(total)


def grow_background(im, tol=30, rounds=3):
    """从已经透明的地方继续向外"吃"背景。

    专治阴影、地面渐变这类颜色慢慢过渡的背景 —— 每轮容差递减，
    一旦颜色跳变（角色轮廓）就停下，所以不会啃进角色本体。
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    total_removed = 0
    t = tol
    for _ in range(rounds):
        seen = bytearray(w * h)
        dq = deque()
        for y in range(h):
            row = y * w
            for x in range(w):
                if px[x, y][3] == 0:
                    i = row + x
                    if not seen[i]:
                        seen[i] = 1
                        dq.append((x, y))
        removed = 0
        while dq:
            x, y = dq.popleft()
            base = px[x, y]
            for (nx, ny) in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    i = ny * w + nx
                    if seen[i]:
                        continue
                    seen[i] = 1
                    c = px[nx, ny]
                    if c[3] == 0:
                        dq.append((nx, ny))
                        continue
                    if dist(c, base) < t:
                        px[nx, ny] = (c[0], c[1], c[2], 0)
                        removed += 1
                        dq.append((nx, ny))
        total_removed += removed
        t = max(13, int(t * 0.68))
        if not removed:
            break
    return im, total_removed


def drop_specks(im, min_area=24):
    """删掉孤立的小碎块（抠图残留的噪点）"""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    killed = 0
    for y0 in range(h):
        for x0 in range(w):
            i0 = y0 * w + x0
            if seen[i0] or px[x0, y0][3] < 16:
                continue
            comp = []
            dq = deque([(x0, y0)])
            seen[i0] = 1
            while dq:
                x, y = dq.popleft()
                comp.append((x, y))
                for (nx, ny) in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        i = ny * w + nx
                        if not seen[i] and px[nx, ny][3] >= 16:
                            seen[i] = 1
                            dq.append((nx, ny))
            if len(comp) < min_area:
                for (x, y) in comp:
                    c = px[x, y]
                    px[x, y] = (c[0], c[1], c[2], 0)
                killed += len(comp)
    return im, killed


def de_fringe(im, passes_bright=2, bright=228, sat=40):
    """贴着透明区的"又亮又灰"的像素 = 白背景残留的白边，逐层去掉。

    注意：这里**只处理亮点**。曾经试过再加一条"又暗又灰"规则去啃地面阴影，
    结果把角色自己的深色描边也啃出锯齿了 —— 阴影应该交给 grow_background
    的渐变蔓延去处理，不要用阈值硬切。
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    total = 0
    for _ in range(passes_bright):
        drop = []
        for y in range(h):
            for x in range(w):
                c = px[x, y]
                if c[3] < 8:
                    continue
                near = False
                for (nx, ny) in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] < 8:
                        near = True
                        break
                if not near:
                    continue
                mx = max(c[0], c[1], c[2])
                mn = min(c[0], c[1], c[2])
                if mx > bright and (mx - mn) < sat:
                    drop.append((x, y))
        for (x, y) in drop:
            c = px[x, y]
            px[x, y] = (c[0], c[1], c[2], 0)
        total += len(drop)
        if not drop:
            break
    return im, total


def feather_alpha(im, radius=0.8):
    """只对 alpha 通道做轻微模糊，边缘不生硬"""
    r, g, b, a = im.split()
    a = a.filter(ImageFilter.GaussianBlur(radius))
    return Image.merge("RGBA", (r, g, b, a))


def de_fringe_dark(im, passes=14, dark=122, dsat=28, y_from=0.45):
    """只对图像下半部分、贴着透明区的"又暗又灰"像素逐层清理。

    用来对付 3D 渲染图里角色的**落地阴影/沙土带**（实测 sat ≤ 24、亮度 ≤ 128）。
    角色的深色描边是饱和深蓝（实测 sat ≥ 37），所以不会被误伤；
    同时限制在下半部分，避免碰到头顶的发饰。
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    y0 = int(h * max(0.0, min(1.0, y_from)))
    total = 0
    for _ in range(passes):
        drop = []
        for y in range(y0, h):
            for x in range(w):
                c = px[x, y]
                if c[3] < 8:
                    continue
                near = False
                for (nx, ny) in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] < 8:
                        near = True
                        break
                if not near:
                    continue
                mx = max(c[0], c[1], c[2])
                mn = min(c[0], c[1], c[2])
                if mx < dark and (mx - mn) < dsat:
                    drop.append((x, y))
        for (x, y) in drop:
            c = px[x, y]
            px[x, y] = (c[0], c[1], c[2], 0)
        total += len(drop)
        if not drop:
            break
    return im, total


def clean_flanks(im, sat_min=30, margin=3, min_sat_px=3):
    """按行算出角色的横向范围，把范围之外的"低饱和暗像素"清掉。

    地面/阴影会在角色左右两侧横着铺开，而角色本体是饱和的蓝色，
    所以用"这一行饱和像素的左右边界 ± margin"当作剪影，外面的灰暗像素就是背景残留。
    一行里凑不出足够饱和像素（例如只有头顶灰盆的那几行）就跳过，不冒险。
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    removed = 0
    for y in range(h):
        xs = []
        for x in range(w):
            c = px[x, y]
            if c[3] > 60 and (max(c[0], c[1], c[2]) - min(c[0], c[1], c[2])) >= sat_min:
                xs.append(x)
        if len(xs) < min_sat_px:
            continue
        x0 = min(xs) - margin
        x1 = max(xs) + margin
        for x in range(w):
            if x0 <= x <= x1:
                continue
            c = px[x, y]
            if c[3] > 8 and (max(c[0], c[1], c[2]) - min(c[0], c[1], c[2])) < sat_min:
                px[x, y] = (c[0], c[1], c[2], 0)
                removed += 1
    return im, removed


def trim_bottom_shadow(im, sat_min=28, min_cols=2):
    """从最底下往上找"真正有角色内容"的最后一行，把下面纯阴影的行裁掉。

    判定：一行里至少 min_cols 个不透明像素的饱和度 ≥ sat_min。
    角色主体是蓝色（饱和度高），地面阴影/沙土是低饱和的灰褐色，能分开。
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    last = h - 1
    for y in range(h - 1, -1, -1):
        n = 0
        for x in range(w):
            c = px[x, y]
            if c[3] > 60:
                mx = max(c[0], c[1], c[2])
                mn = min(c[0], c[1], c[2])
                if (mx - mn) >= sat_min:
                    n += 1
                    if n >= min_cols:
                        break
        if n >= min_cols:
            last = y
            break
    if last >= h - 1:
        return im, 0
    cut = h - 1 - last
    return im.crop((0, 0, w, last + 1)), cut


def process(path, max_side=512, grow_tol=30, grow_rounds=3, key_tol=46, dark_clean=False, trim_bottom=False, flank_clean=False):
    if not os.path.exists(path):
        print("  skip (missing): %s" % path)
        return False
    name = os.path.basename(path)
    bak = path + ".bak.png"
    if os.path.exists(bak):
        # 有原始备份就从原始备份开始处理，保证脚本可以反复跑（避免二次抠图）
        print("== %s  (from %s)" % (name, os.path.basename(bak)))
        src_path = bak
    else:
        print("== %s" % name)
        src_path = path
    im = Image.open(src_path)
    ext = alpha_extrema(im.convert("RGBA"))
    transparent = ext is not None and ext[0] < 246
    im = im.convert("RGBA")
    cut = 0.0
    if transparent:
        print("   already has alpha, skip keying")
    else:
        im, cut = key_out_background(im, key_tol)
        print("   background keyed out: %.1f%%" % (cut * 100))
        if not (0.05 < cut < 0.94):
            print("   ratio looks wrong -> keep original")
            im = Image.open(src_path).convert("RGBA")
        else:
            im, grown = grow_background(im, grow_tol, grow_rounds)
            im, killed = drop_specks(im, 32)
            im, fr = de_fringe(im)
            extra = 0
            if flank_clean:
                im, fk = clean_flanks(im)
                print("   flanks cleaned: %d px" % fk)
            if dark_clean:
                im, extra = de_fringe_dark(im)
            if trim_bottom:
                im, tcut = trim_bottom_shadow(im)
                if tcut:
                    print("   bottom shadow rows trimmed: %d" % tcut)
            print("   grown: %d px, speckles: %d px, fringe: %d px, shadow: %d px" % (grown, killed, fr, extra))
            im = feather_alpha(im, 0.7)
    box = im.getbbox()
    if box:
        pad = int(max(box[2] - box[0], box[3] - box[1]) * 0.03)
        box = (max(0, box[0] - pad), max(0, box[1] - pad),
               min(im.size[0], box[2] + pad), min(im.size[1], box[3] + pad))
        im = im.crop(box)
        print("   cropped to character box: %dx%d" % (im.size[0], im.size[1]))
    if max(im.size) > max_side:
        k = max_side / float(max(im.size))
        im = im.resize((max(1, int(im.size[0] * k)), max(1, int(im.size[1] * k))), Image.LANCZOS)
        print("   resized to %dx%d" % (im.size[0], im.size[1]))
    bak = path + ".bak.png"
    if not os.path.exists(bak):
        Image.open(path).save(bak, "PNG")
    im.save(path, "PNG", optimize=True)
    print("   saved %s  %.1f KB  opaque %.1f%%"
          % (name, os.path.getsize(path) / 1024.0, opaque_ratio(im) * 100))
    return True


def opaque_ratio(im):
    a = im.getchannel("A")
    hist = a.histogram()
    return sum(hist[16:]) / float(im.size[0] * im.size[1])


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if args:
        targets = [a if os.path.isabs(a) else os.path.join(ASSETS, a) for a in args]
    else:
        targets = [os.path.join(ASSETS, n) for n in ("fish.png", "fish_bowl.png")]
    ok = 0
    for t in targets:
        if process(t):
            ok += 1
    print("\ndone %d/%d" % (ok, len(targets)))
    print("originals are backed up as *.png.bak.png")
