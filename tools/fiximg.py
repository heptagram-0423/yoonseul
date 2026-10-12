#!/usr/bin/env python3
"""GPT 웹에서 만들어 온 이미지를 게임에 바로 쓸 수 있게 보정한다.

GPT 웹은 1024x1024 / 1536x1024 같은 고정 크기로만 내려주는데
게임은 viewBox 0 0 1200 800 기준이라 크기를 맞춰야 한다.
목표 해상도는 tools/image-presets.json에서 읽으므로 설정이 한 곳에만 있다.

사용 예
  python tools/fiximg.py --latest --preset scene --name front
  python tools/fiximg.py ~/Downloads/a.png --preset character --name bongsun --cutout
  python tools/fiximg.py assets/_inbox/x.png --preset item --name marble --cutout --webp
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Windows 기본 로케일(cp949)로 내보내면 터미널에서 한글이 깨진다.
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8")
        except Exception:
            pass

ROOT = Path(__file__).resolve().parent.parent
PRESETS = ROOT / "tools" / "image-presets.json"
IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}

# GPT 웹에서 받은 원본을 모아두는 곳
INBOX = ROOT / "assets" / "_inbox"
DOWNLOADS = Path.home() / "Downloads"


def load_presets():
    with open(PRESETS, encoding="utf-8") as f:
        return json.load(f)


def newest_image(*dirs):
    """지정한 폴더들에서 가장 최근에 수정된 이미지 파일을 찾는다."""
    cands = []
    for d in dirs:
        if d.is_dir():
            cands += [p for p in d.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXT]
    if not cands:
        raise SystemExit(f"이미지를 찾지 못했습니다. 확인한 폴더: {', '.join(str(d) for d in dirs)}")
    return max(cands, key=lambda p: p.stat().st_mtime)


def cover_resize(im, tw, th):
    """목표 비율로 가운데를 잘라낸 뒤 정확한 크기로 맞춘다.

    게임의 배경 SVG가 preserveAspectRatio="slice"로 어차피 잘라내므로
    가장자리를 버리는 cover 방식이 자연스럽다.
    """
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = round(sw * scale), round(sh * scale)
    im = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def contain_resize(im, tw, th, pad=(0, 0, 0, 0)):
    """잘라내지 않고 전체를 담는다. 남는 공간은 투명으로 채운다."""
    sw, sh = im.size
    scale = min(tw / sw, th / sh)
    nw, nh = round(sw * scale), round(sh * scale)
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), pad)
    canvas.paste(im, ((tw - nw) // 2, (th - nh) // 2), im if im.mode == "RGBA" else None)
    return canvas


def cutout_flat_background(im, tol=28):
    """네 모서리에서 번져 나가며 단색 배경을 투명하게 만든다.

    GPT가 흰 배경이나 단색 배경으로 그려줬을 때만 쓸 수 있는 어림짐작이다.
    배경에 그라데이션이나 질감이 있으면 깔끔하게 지워지지 않는다.
    인물 자체에 배경과 비슷한 색(흰 셔츠 등)이 있어도 연결만 안 돼 있으면 남는다.
    """
    im = im.convert("RGBA")
    a = np.array(im)
    h, w = a.shape[:2]
    rgb = a[:, :, :3].astype(np.int16)

    corners = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    # 배경색은 네 모서리의 중앙값으로 잡는다 (한 모서리에 물체가 걸쳐도 버틴다)
    bg = np.median([rgb[y, x] for y, x in corners], axis=0)

    near = (np.abs(rgb - bg).max(axis=2) <= tol)

    # 모서리에서 시작해 연결된 영역만 지운다 (BFS를 행 단위 전파로 근사)
    seed = np.zeros((h, w), bool)
    for y, x in corners:
        if near[y, x]:
            seed[y, x] = True
    if not seed.any():
        return im, 0.0

    # 반복 팽창 후 near와 교집합 -> 연결 성분 확장. 변화가 없을 때까지.
    prev = -1
    cur = seed.sum()
    while cur != prev:
        prev = cur
        g = seed.copy()
        g[1:, :] |= seed[:-1, :]
        g[:-1, :] |= seed[1:, :]
        g[:, 1:] |= seed[:, :-1]
        g[:, :-1] |= seed[:, 1:]
        seed = g & near
        cur = seed.sum()

    a[:, :, 3] = np.where(seed, 0, a[:, :, 3])
    return Image.fromarray(a, "RGBA"), float(seed.sum()) / (h * w)


def human(n):
    return f"{n/1024:.0f} KB" if n < 1024 * 1024 else f"{n/1024/1024:.2f} MB"


def main():
    conf = load_presets()
    names = list(conf["presets"].keys())

    ap = argparse.ArgumentParser(description="GPT로 만든 이미지를 게임 규격으로 보정한다.")
    ap.add_argument("input", nargs="?", help="입력 이미지 경로. 생략하면 --latest 가 필요하다.")
    ap.add_argument("--latest", action="store_true",
                    help=f"assets/_inbox 와 다운로드 폴더에서 가장 최근 이미지를 자동 선택")
    ap.add_argument("--preset", required=True, choices=names, help="목표 규격")
    ap.add_argument("--name", help="저장할 파일명(확장자 생략). 생략하면 원본 이름을 쓴다.")
    ap.add_argument("--fit", choices=["cover", "contain"], default=None,
                    help="cover=가운데를 잘라 꽉 채움(배경 기본), contain=전체를 담고 여백 투명(인물·소품 기본)")
    ap.add_argument("--cutout", action="store_true", help="단색 배경을 투명하게 지운다(인물·소품용)")
    ap.add_argument("--tol", type=int, default=28, help="배경 제거 색 허용 오차 (기본 28)")
    ap.add_argument("--webp", action="store_true", help="png 대신 webp로 저장 (용량 절감)")
    ap.add_argument("--dry-run", action="store_true", help="저장하지 않고 무엇을 할지만 출력")
    args = ap.parse_args()

    # --- 입력 결정 ---
    if args.latest:
        src = newest_image(INBOX, DOWNLOADS)
    elif args.input:
        src = Path(args.input).expanduser()
        if not src.is_absolute():
            src = (ROOT / src) if (ROOT / src).exists() else src.resolve()
    else:
        ap.error("입력 경로를 주거나 --latest 를 쓰세요.")
    if not src.is_file():
        raise SystemExit(f"파일이 없습니다: {src}")

    p = conf["presets"][args.preset]
    tw, th = (int(v) for v in p["size"].split("x"))
    transparent = bool(p.get("transparent"))
    fit = args.fit or ("contain" if transparent else "cover")

    out_dir = ROOT / p["dir"]
    stem = args.name or src.stem
    ext = ".webp" if args.webp else ".png"
    dst = out_dir / (stem + ext)

    im = Image.open(src)
    ow, oh = im.size
    print(f"입력   : {src}")
    print(f"         {ow}x{oh} {im.mode} {human(src.stat().st_size)}")
    print(f"프리셋 : {args.preset} -> {tw}x{th}, {'투명' if transparent else '불투명'}, fit={fit}")

    if args.dry_run:
        print(f"저장(예정): {dst.relative_to(ROOT).as_posix()}  (--dry-run 이라 저장하지 않음)")
        return

    # --- 배경 제거 ---
    removed = None
    if args.cutout:
        im, ratio = cutout_flat_background(im, args.tol)
        removed = ratio
        print(f"배경제거: 전체의 {ratio*100:.1f}% 를 투명화 (허용오차 {args.tol})")
        if ratio < 0.05:
            print("         ! 거의 지워지지 않았습니다. 배경이 단색이 아닐 수 있습니다. --tol 을 올려보세요.")
        elif ratio > 0.92:
            print("         ! 너무 많이 지워졌습니다. --tol 을 낮춰보세요.")

    # --- 크기 맞춤 ---
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    im = cover_resize(im, tw, th) if fit == "cover" else contain_resize(im, tw, th)

    if not transparent:
        # 배경 이미지는 알파가 필요 없다. 흰색 위에 합성해 RGB로 떨어뜨린다.
        flat = Image.new("RGB", im.size, (255, 255, 255))
        flat.paste(im, (0, 0), im)
        im = flat

    out_dir.mkdir(parents=True, exist_ok=True)
    if args.webp:
        im.save(dst, "WEBP", quality=92, method=6)
    else:
        im.save(dst, "PNG", optimize=True)

    print(f"저장   : {dst.relative_to(ROOT).as_posix()}")
    print(f"         {tw}x{th} {im.mode} {human(dst.stat().st_size)}")

    if transparent and removed is None:
        print("         ! 이 프리셋은 투명 배경을 전제로 합니다. 배경이 남아 있으면 --cutout 을 붙여 다시 실행하세요.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
