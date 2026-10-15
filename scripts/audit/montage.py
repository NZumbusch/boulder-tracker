# python3 -I montage.py out.png vp=file.png ... : one image with every viewport of a screen, scaled to fit, labelled.
import sys
from PIL import Image, ImageDraw
out, items = sys.argv[1], sys.argv[2:]
cells = []
for it in items:
    vp, f = it.split('=', 1)
    cells.append((vp, Image.open(f).convert('RGB')))
CW, CH, PAD, LAB = 640, 460, 10, 18
cols = 3 if len(cells) > 2 else len(cells)
rows = (len(cells) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (CW + PAD) + PAD, rows * (CH + LAB + PAD) + PAD), (128, 128, 128))
d = ImageDraw.Draw(sheet)
for i, (vp, im) in enumerate(cells):
    s = min(CW / im.width, CH / im.height)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))))
    x = PAD + (i % cols) * (CW + PAD)
    y = PAD + (i // cols) * (CH + LAB + PAD)
    d.text((x, y), f'{vp} {cells[i][1].width}x{cells[i][1].height}', fill=(255, 255, 255))
    sheet.paste(im, (x, y + LAB))
sheet.save(out)
