"""生成小程序用的线性图标（tabBar + 页面内图标）。

运行：python tools/draw_icons.py
输出到 miniprogram/images/。风格：圆头线条，未选中苔绿、选中松绿 + 一处灯光琥珀点缀。
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'miniprogram', 'images')

GREY = (127, 168, 139, 255)   # 苔绿：tab 未选中、弱图标
PINE = (47, 107, 82, 255)     # 松绿
LAMP = (240, 180, 76, 255)
WHITE = (255, 255, 255, 255)
ROSE = (196, 87, 74, 255)
MIST = (210, 227, 206, 255)   # 嫩芽：默认头像底

S = 4  # 超采样倍数


class Pen:
    def __init__(self, size):
        self.size = size
        self.k = size * S / 24.0  # 以 24 单位画布设计
        self.im = Image.new('RGBA', (size * S, size * S), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def p(self, x, y):
        return (x * self.k, y * self.k)

    def w(self, v):
        return max(1, int(round(v * self.k)))

    def line(self, pts, color, width=1.7):
        pts = [self.p(*q) for q in pts]
        wd = self.w(width)
        self.d.line(pts, fill=color, width=wd, joint='curve')
        r = wd / 2
        for x, y in (pts[0], pts[-1]):
            self.d.ellipse((x - r, y - r, x + r, y + r), fill=color)

    def poly(self, pts, color, width=1.7):
        self.line(list(pts) + [pts[0], pts[1]], color, width)

    def rrect(self, x0, y0, x1, y1, r, color, width=1.7, fill=None):
        self.d.rounded_rectangle((*self.p(x0, y0), *self.p(x1, y1)), radius=r * self.k,
                                 outline=None if width == 0 else color,
                                 width=0 if width == 0 else self.w(width), fill=fill)

    def circle(self, cx, cy, r, color, width=1.7, fill=None):
        self.d.ellipse((*self.p(cx - r, cy - r), *self.p(cx + r, cy + r)),
                       outline=None if width == 0 else color,
                       width=0 if width == 0 else self.w(width), fill=fill)

    def arc(self, cx, cy, r, a0, a1, color, width=1.7):
        pts = []
        steps = 40
        for i in range(steps + 1):
            a = math.radians(a0 + (a1 - a0) * i / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        self.line(pts, color, width)

    def shape(self, draw_fn, color, width=1.7, fill=False):
        """在蒙版上画出实心形状，再腐蚀出等宽描边，适合月牙、气泡这类组合轮廓。"""
        mask = Image.new('L', self.im.size, 0)
        draw_fn(ImageDraw.Draw(mask), self)
        if not fill:
            n = self.w(width)
            inner = mask.filter(ImageFilter.MinFilter(n | 1))
            mask = Image.composite(Image.new('L', mask.size, 0), mask, inner)
        layer = Image.new('RGBA', self.im.size, color)
        self.im.paste(layer, (0, 0), mask)

    def save(self, name):
        self.im.resize((self.size, self.size), Image.LANCZOS).save(os.path.join(OUT, name))


def home(c, accent=None, size=81):
    g = Pen(size)
    g.line([(3.5, 11), (12, 4), (20.5, 11)], c)
    g.line([(5.5, 9.5), (5.5, 20), (18.5, 20), (18.5, 9.5)], c)
    if accent:
        g.rrect(9.6, 12.2, 14.4, 17, 0.8, accent, 0, fill=accent)
    else:
        g.rrect(9.6, 12.2, 14.4, 17, 0.8, c, 1.4)
    return g


def moon(c, accent=None, size=81):
    g = Pen(size)

    def crescent(d, g):
        d.ellipse((*g.p(4, 4), *g.p(20, 20)), fill=255)
        d.ellipse((*g.p(9.2, 1.4), *g.p(22.6, 14.8)), fill=0)
    g.shape(crescent, c)
    if accent:
        g.circle(18.4, 4.6, 1.5, accent, 0, fill=accent)
    return g


def lots(c, accent=None, size=81):
    g = Pen(size)
    g.line([(5.5, 11), (6.6, 20.5), (17.4, 20.5), (18.5, 11)], c)
    g.line([(4.5, 11), (19.5, 11)], c)
    g.line([(9, 11), (7.8, 3.6)], c)
    g.line([(12, 11), (12, 2.8)], accent or c)
    g.line([(15, 11), (16.2, 3.6)], c)
    return g


def frame(c, accent=None, size=81):
    g = Pen(size)
    g.rrect(3.5, 5, 20.5, 19, 2.6, c)
    g.line([(5.2, 17.2), (10, 11.6), (13.6, 15.2), (15.6, 13.2), (19, 16.8)], c, 1.5)
    if accent:
        g.circle(16, 9, 1.9, accent, 0, fill=accent)
    else:
        g.circle(16, 9, 1.6, c, 1.4)
    return g


def person(c, accent=None, size=81):
    g = Pen(size)
    if accent:
        g.circle(12, 8.2, 3.9, accent, 0, fill=accent)
    else:
        g.circle(12, 8.2, 3.6, c)
    g.arc(12, 21.5, 7.6, 200, 340, c)
    return g


def bowl(c, accent=None, size=81):
    g = Pen(size)
    g.line([(3.5, 11.5), (20.5, 11.5)], c)
    g.arc(12, 11.5, 8.5, 0, 180, c)
    g.line([(9, 20), (15, 20)], c)
    steam = accent or c
    g.line([(9, 8.5), (8.2, 6.6), (9, 4.6)], steam, 1.4)
    g.line([(12.5, 8.5), (11.7, 6.6), (12.5, 4.6)], steam, 1.4)
    g.line([(16, 8.5), (15.2, 6.6), (16, 4.6)], steam, 1.4)
    return g


def heart(c, fill=False, size=48):
    g = Pen(size)
    pts = []
    for i in range(0, 361, 3):
        t = math.radians(i)
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((12 + x * 0.5, 11.2 - y * 0.5))
    if fill:
        g.d.polygon([g.p(*q) for q in pts], fill=c)
    else:
        g.line(pts, c, 1.7)
    return g


def bubble(c, size=48):
    g = Pen(size)

    def shape(d, g):
        d.ellipse((*g.p(3.5, 3), *g.p(20.5, 19)), fill=255)
        d.polygon([g.p(6.2, 14.5), g.p(4, 21), g.p(11, 18)], fill=255)
    g.shape(shape, c)
    return g


def smile(c, size=48):
    g = Pen(size)
    g.circle(12, 12, 8.5, c)
    g.circle(9, 10, 0.9, c, 0, fill=c)
    g.circle(15, 10, 0.9, c, 0, fill=c)
    g.arc(12, 12, 4.6, 30, 150, c, 1.6)
    return g


def picture(c, size=48):
    return frame(c, None, size)


def pen(c, size=64):
    g = Pen(size)
    g.line([(12, 6), (12, 18)], c, 2)
    g.line([(6, 12), (18, 12)], c, 2)
    return g


def avatar(size=160):
    g = Pen(size)
    g.circle(12, 12, 12, MIST, 0, fill=MIST)
    g.circle(12, 9.6, 3.8, (255, 255, 255, 255), 0, fill=(255, 255, 255, 255))
    g.d.pieslice((*g.p(4.5, 14.5), *g.p(19.5, 29.5)), 180, 360, fill=(255, 255, 255, 255))
    # 圆形裁切
    mask = Image.new('L', g.im.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, g.im.size[0] - 1, g.im.size[1] - 1), fill=255)
    g.im.putalpha(Image.composite(g.im.getchannel('A'), mask, mask))
    return g


def main():
    os.makedirs(OUT, exist_ok=True)
    tabs = {'home': home, 'checkin': moon, 'lottery': lots, 'moments': frame, 'profile': person}
    for name, fn in tabs.items():
        fn(GREY).save(f'{name}.png')
        fn(PINE, LAMP).save(f'{name}-active.png')
    # 首页入口用的大图标（松绿 + 琥珀）
    entries = {'checkin': moon, 'lottery': lots, 'moments': frame, 'meal': bowl}
    for name, fn in entries.items():
        fn(PINE, LAMP, size=96).save(f'ic-{name}.png')
    heart(GREY).save('ic-like.png')
    heart(ROSE, fill=True).save('ic-liked.png')
    bubble(GREY).save('ic-comment.png')
    smile(GREY).save('ic-smile.png')
    picture(GREY).save('ic-image.png')
    pen(WHITE).save('ic-plus.png')
    avatar().save('avatar.png')
    print('icons written to', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
