#!/usr/bin/env python3
"""
Genera android-icons/ para MusicTrack — patrón RiderTrack v2.
Entrada: logo del usuario (1254x1254, fondo blanco, insignia circular).
Salida:  musictrack/android-icons/ con mipmaps por densidad, XML adaptativo,
         splash vertical/horizontal + iconos web en public/.
"""
from PIL import Image, ImageDraw
import os

LOGO = '/home/z/my-project/upload/file_00000000bc58820e952da4af48ee212d.png'
BASE = '/home/z/my-project/musictrack'
ICONS = os.path.join(BASE, 'android-icons')
PUBLIC = os.path.join(BASE, 'public')

# ---------- helpers ----------
def load_logo() -> Image.Image:
    img = Image.open(LOGO).convert('RGB')
    return img

def blanco(tam) -> Image.Image:
    return Image.new('RGB', (tam, tam), (255, 255, 255))

def pegar_central(canvas: Image.Image, logo: Image.Image, escala: float) -> Image.Image:
    """Pega el logo escalado a `escala` del lado del canvas, centrado."""
    lado = int(canvas.size[0] * escala)
    l = logo.resize((lado, lado), Image.LANCZOS)
    x = (canvas.size[0] - lado) // 2
    y = (canvas.size[1] - lado) // 2
    canvas.paste(l, (x, y))
    return canvas

def icono_cuadrado(logo: Image.Image, tam: int) -> Image.Image:
    """Legacy cuadrado: logo completo full-bleed (conserva notas y arcos)."""
    return logo.resize((tam, tam), Image.LANCZOS)

def icono_redondo(logo: Image.Image, tam: int) -> Image.Image:
    """Legacy redondo: máscara circular con antialias (supersample 4x)."""
    ss = tam * 4
    cuadrado = logo.resize((ss, ss), Image.LANCZOS).convert('RGBA')
    mascara = Image.new('L', (ss, ss), 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, ss - 1, ss - 1), fill=255)
    mascara = mascara.resize((tam, tam), Image.LANCZOS)
    out = cuadrado.resize((tam, tam), Image.LANCZOS).convert('RGBA')
    out.putalpha(mascara)
    return out

def icono_foreground(logo: Image.Image, tam: int) -> Image.Image:
    """Foreground adaptativo: canvas blanco + arte al ~62% (zona segura 66%)."""
    canvas = blanco(tam)
    return pegar_central(canvas, logo, 0.64)

def splash(logo: Image.Image, w: int, h: int, ancho_logo: int, y_centro: float) -> Image.Image:
    """Splash: fondo blanco + logo centrado (ancho_logo px, centro vertical y_centro)."""
    canvas = Image.new('RGB', (w, h), (255, 255, 255))
    lado = ancho_logo
    l = logo.resize((lado, lado), Image.LANCZOS)
    x = (w - lado) // 2
    y = int(h * y_centro) - lado // 2
    canvas.paste(l, (x, y))
    return canvas

# ---------- estructura ridertrack-v2 ----------
DENSIDADES = {
    'mipmap-mdpi':    {'launcher': 48,  'foreground': 108},
    'mipmap-hdpi':    {'launcher': 72,  'foreground': 162},
    'mipmap-xhdpi':   {'launcher': 96,  'foreground': 216},
    'mipmap-xxhdpi':  {'launcher': 144, 'foreground': 324},
    'mipmap-xxxhdpi': {'launcher': 192, 'foreground': 432},
}

XML_ADAPTATIVO = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'''

XML_COLOR = '''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
'''

def main():
    logo = load_logo()
    print(f'Logo: {logo.size[0]}x{logo.size[1]}')

    # 1) mipmaps por densidad
    for carpeta, d in DENSIDADES.items():
        ruta = os.path.join(ICONS, carpeta)
        os.makedirs(ruta, exist_ok=True)
        icono_cuadrado(logo, d['launcher']).save(os.path.join(ruta, 'ic_launcher.png'), optimize=True)
        icono_redondo(logo, d['launcher']).save(os.path.join(ruta, 'ic_launcher_round.png'), optimize=True)
        icono_foreground(logo, d['foreground']).save(os.path.join(ruta, 'ic_launcher_foreground.png'), optimize=True)
        print(f'  {carpeta}: launcher {d["launcher"]}px, foreground {d["foreground"]}px')

    # 2) XML adaptativo (color + foreground PNG)
    ruta_anydpi = os.path.join(ICONS, 'mipmap-anydpi-v26')
    os.makedirs(ruta_anydpi, exist_ok=True)
    with open(os.path.join(ruta_anydpi, 'ic_launcher.xml'), 'w') as f:
        f.write(XML_ADAPTATIVO)
    with open(os.path.join(ruta_anydpi, 'ic_launcher_round.xml'), 'w') as f:
        f.write(XML_ADAPTATIVO)

    # 3) color de fondo
    ruta_values = os.path.join(ICONS, 'values')
    os.makedirs(ruta_values, exist_ok=True)
    with open(os.path.join(ruta_values, 'ic_launcher_background.xml'), 'w') as f:
        f.write(XML_COLOR)

    # 4) splash vertical + horizontal (fondo blanco como el logo)
    os.makedirs(os.path.join(ICONS, 'drawable'), exist_ok=True)
    os.makedirs(os.path.join(ICONS, 'drawable-land'), exist_ok=True)
    splash(logo, 1080, 1920, 900, 0.50).save(os.path.join(ICONS, 'drawable', 'splash.png'), optimize=True)
    splash(logo, 1920, 1080, 700, 0.50).save(os.path.join(ICONS, 'drawable-land', 'splash.png'), optimize=True)
    print('  splash: 1080x1920 + 1920x1080')

    # 5) iconos web (favicon + apple-touch + PWA)
    os.makedirs(PUBLIC, exist_ok=True)
    logo.resize((512, 512), Image.LANCZOS).save(os.path.join(PUBLIC, 'icono-512.png'), optimize=True)
    logo.resize((192, 192), Image.LANCZOS).save(os.path.join(PUBLIC, 'icono-192.png'), optimize=True)
    logo.resize((180, 180), Image.LANCZOS).save(os.path.join(PUBLIC, 'apple-touch-icon.png'), optimize=True)
    logo.resize((64, 64), Image.LANCZOS).save(os.path.join(PUBLIC, 'favicon.png'), optimize=True)
    print('  web: icono-512, icono-192, apple-touch-icon, favicon (public/)')

    # 6) preview QA: simulación de máscara circular y squircle del launcher
    qa = '/home/z/my-project/qa-icono'
    os.makedirs(qa, exist_ok=True)
    fg = icono_foreground(logo, 432)
    # máscara circular
    m = Image.new('L', (432, 432), 0)
    ImageDraw.Draw(m).ellipse((0, 0, 431, 431), fill=255)
    circ = fg.convert('RGBA'); circ.putalpha(m)
    circ.save(os.path.join(qa, 'preview-circulo.png'))
    # máscara squircle (rounded rect ~22%)
    m2 = Image.new('L', (432, 432), 0)
    ImageDraw.Draw(m2).rounded_rectangle((0, 0, 431, 431), radius=95, fill=255)
    sq = fg.convert('RGBA'); sq.putalpha(m2)
    sq.save(os.path.join(qa, 'preview-squircle.png'))
    # splash preview reducido
    splash(logo, 540, 960, 450, 0.50).save(os.path.join(qa, 'preview-splash.png'))
    # legacy cuadrado + redondo
    icono_cuadrado(logo, 192).save(os.path.join(qa, 'preview-cuadrado.png'))
    icono_redondo(logo, 192).save(os.path.join(qa, 'preview-redondo.png'))
    print(f'  previews QA en {qa}/')

    print('LISTO')

if __name__ == '__main__':
    main()
