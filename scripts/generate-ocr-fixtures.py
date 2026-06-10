#!/usr/bin/env python3
"""重新產生 test/fixtures/ocr/ 的合成測試圖。

全部是合成資料：4111... 是 Visa 官方測試卡號、A123456789 是教科書檢核碼範例、
5520...5674 是本腳本算出的 Luhn-valid 測試號。不含任何真人資訊。

用法：python3 scripts/generate-ocr-fixtures.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "test", "fixtures", "ocr")


def font(size):
    for p in ["/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()


def cjk_font(size):
    for p in ["/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/STHeiti Medium.ttc",
              "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return font(size)


def luhn_check_digit(partial):
    total = 0
    for i, ch in enumerate(reversed(partial)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return (10 - total % 10) % 10


def main():
    os.makedirs(OUT, exist_ok=True)

    # 信用卡正面（傳統凸字款）
    card = Image.new("RGB", (1000, 630), (25, 55, 109))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([60, 120, 200, 220], 12, fill=(212, 175, 55))
    d.text((60, 280), "4111 1111 1111 1111", font=font(72), fill="white")
    d.text((60, 420), "VALID THRU  12/28", font=font(40), fill="white")
    d.text((60, 500), "WANG MING TEST", font=font(48), fill="white")
    d.text((780, 530), "VISA", font=font(56), fill="white")
    card.save(os.path.join(OUT, "card_front.jpg"), quality=90)

    # 信用卡背面（傳統款：磁條 + 簽名欄，無卡號）
    back = Image.new("RGB", (1000, 630), (40, 40, 40))
    d = ImageDraw.Draw(back)
    d.rectangle([0, 80, 1000, 180], fill=(10, 10, 10))
    d.rectangle([60, 260, 700, 340], fill="white")
    d.text((720, 280), "123", font=font(44), fill="black")
    back.save(os.path.join(OUT, "card_back.jpg"), quality=90)

    # 新式卡背面（卡號印在背面）
    partial = "552012345678567"
    num = partial + str(luhn_check_digit(partial))
    ns = Image.new("RGB", (1000, 630), (60, 60, 70))
    d = ImageDraw.Draw(ns)
    d.rectangle([0, 60, 1000, 150], fill=(15, 15, 15))
    d.rectangle([60, 200, 620, 270], fill=(235, 235, 235))
    grouped = " ".join(num[i:i + 4] for i in range(0, 16, 4))
    d.text((60, 320), grouped, font=font(58), fill="white")
    d.text((60, 420), "EXP 11/29", font=font(40), fill="white")
    d.text((640, 215), "CVV 987", font=font(36), fill="black")
    ns.save(os.path.join(OUT, "newstyle_back.jpg"), quality=90)

    # 身分證正面（合成）
    idf = Image.new("RGB", (1000, 630), (230, 240, 230))
    d = ImageDraw.Draw(idf)
    d.text((300, 40), "中華民國國民身分證", font=cjk_font(52), fill=(20, 80, 40))
    d.text((80, 180), "姓名  王小明", font=cjk_font(56), fill="black")
    d.text((80, 300), "出生日期  民國80年5月15日", font=cjk_font(44), fill="black")
    d.text((80, 420), "統一編號  A123456789", font=cjk_font(52), fill="black")
    d.rectangle([700, 180, 940, 500], outline="gray", width=3)
    idf.save(os.path.join(OUT, "id_front.jpg"), quality=90)

    # 身分證背面（合成）
    idb = Image.new("RGB", (1000, 630), (235, 235, 225))
    d = ImageDraw.Draw(idb)
    d.text((80, 100), "父 王大明  母 李美麗", font=cjk_font(44), fill="black")
    d.text((80, 220), "住址  台北市信義區測試路1號", font=cjk_font(40), fill="black")
    idb.save(os.path.join(OUT, "id_back.jpg"), quality=90)

    print("fixtures written to", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
