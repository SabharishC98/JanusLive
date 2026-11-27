import os
import math
from PIL import Image, ImageOps
import numpy as np

def generate_dragon_gif(size=500, num_frames=36, out_filename='sudarkalam_dragon_flight.gif'):
    # Load assets
    arena_full = Image.open('public/images/sudarkalam_arena_only.jpg').convert('L')
    dragon_orig = Image.open('public/images/logo_dragon_clean.png').convert('RGBA')
    wall_orig = Image.open('public/images/arena_front_wall.png').convert('RGBA')

    scale_factor = size / 1024.0

    # 1. Base Dark Arena Background
    arena_resized = arena_full.resize((size, size), Image.Resampling.LANCZOS)
    arena_arr = np.array(arena_resized)

    base_dark = np.zeros((size, size, 3), dtype=np.uint8)
    base_dark[:, :] = [9, 9, 7] # #090907 obsidian

    # Line etching: glowing ivory (#F5F2EB)
    line_int = np.clip((255 - arena_arr) * 1.5, 0, 255) / 255.0
    for c, col in enumerate([245, 242, 235]):
        base_dark[:, :, c] = np.clip(base_dark[:, :, c] * (1 - line_int) + col * line_int, 0, 255).astype(np.uint8)

    base_arena_img = Image.fromarray(base_dark)

    # 2. Scaled Front Wall Sprite
    wall_w = int(round(wall_orig.width * scale_factor))
    wall_h = int(round(wall_orig.height * scale_factor))
    wall_scaled = wall_orig.resize((wall_w, wall_h), Image.Resampling.LANCZOS)
    wall_x = int(round(290 * scale_factor))
    wall_y = int(round(535 * scale_factor))

    # 3. Orbit Parameters
    cx = size // 2
    Rx = int(round(145 * (size / 500.0))) # horizontal radius
    Ry = int(round(65 * (size / 500.0)))  # vertical perspective radius
    y_offset = int(round(250 * (size / 500.0))) # vertical center of orbit

    dw, dh = dragon_orig.size
    dragon_arr = np.array(dragon_orig)
    dx_mesh = np.arange(dw)
    dy_mesh = np.arange(dh)
    xx, yy = np.meshgrid(dx_mesh, dy_mesh)

    raw_frames = []

    for i in range(num_frames):
        theta = float(2 * math.pi * i / num_frames)

        # Orbit Position:
        # theta = 0: front-center (moving right)
        # theta = pi: back-center (moving left)
        px = cx + Rx * math.sin(theta)
        py = y_offset + Ry * math.cos(theta)

        # Tangent velocity:
        vx = Rx * math.cos(theta)
        vy = -Ry * math.sin(theta)

        # In front (cos >= 0) or at back (cos < 0)
        is_front = math.cos(theta) >= -0.12

        # Perspective depth: 1.0 (closest/front) to 0.0 (furthest/back)
        depth_norm = float((math.cos(theta) + 1.0) / 2.0)
        scale = float((0.72 + 0.42 * depth_norm) * scale_factor * 1.75)

        # Aerial serpentine wave deformation:
        phase = float(2 * math.pi * (i / num_frames * 2.0))
        wave_amp = 5.0
        src_y = np.clip(yy - np.round(wave_amp * np.sin(2 * np.pi * xx / 95.0 + phase)), 0, dh - 1).astype(int)
        src_x = np.clip(xx - np.round(2.0 * np.cos(2 * np.pi * yy / 115.0 + phase)), 0, dw - 1).astype(int)
        deformed_dragon = Image.fromarray(dragon_arr[src_y, src_x])

        # Direction and banking:
        if vx >= 0:
            d_sprite = deformed_dragon
            bank = float(math.degrees(math.atan2(vy, max(abs(vx), 1.0))) * 0.42)
        else:
            d_sprite = ImageOps.mirror(deformed_dragon)
            bank = float(math.degrees(math.atan2(-vy, max(abs(vx), 1.0))) * 0.42)

        # Rotate with banking
        d_rotated = d_sprite.rotate(bank, resample=Image.Resampling.BILINEAR, expand=True)

        # Resize for distance
        target_dw = max(10, int(round(d_rotated.width * scale)))
        target_dh = max(10, int(round(d_rotated.height * scale)))
        d_final = d_rotated.resize((target_dw, target_dh), Image.Resampling.LANCZOS)

        # Dimmer in distance, glowing in foreground
        if depth_norm < 0.45:
            dim = float(0.68 + 0.32 * (depth_norm / 0.45))
            r, g, b, a = d_final.split()
            r = r.point(lambda p: int(p * dim))
            g = g.point(lambda p: int(p * dim))
            b = b.point(lambda p: int(p * dim))
            d_final = Image.merge('RGBA', (r, g, b, a))

        # Compose frame
        frame = base_arena_img.copy()
        d_x = int(round(px - target_dw / 2.0))
        d_y = int(round(py - target_dh / 2.0))

        if not is_front:
            # BACK: dragon behind front wall
            frame.paste(d_final, (d_x, d_y), d_final)
            frame.paste(wall_scaled, (wall_x, wall_y), wall_scaled)
        else:
            # FRONT: dragon in front of front wall
            frame.paste(wall_scaled, (wall_x, wall_y), wall_scaled)
            frame.paste(d_final, (d_x, d_y), d_final)

        raw_frames.append(frame)

    # Convert to palette GIF with 128 colors for optimal size & quality
    palette_sample = raw_frames[0].quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    opt_frames = [f.quantize(colors=128, palette=palette_sample, dither=Image.Dither.FLOYDSTEINBERG) for f in raw_frames]

    artifact_dir = r'C:\Users\sabha\.gemini\antigravity\brain\0df76df4-3b6e-4b76-b64c-fa95372f25b3'
    out_paths = [
        os.path.join('public', 'images', out_filename),
        os.path.join(artifact_dir, out_filename)
    ]

    for p in out_paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        opt_frames[0].save(
            p,
            save_all=True,
            append_images=opt_frames[1:],
            duration=55, # 55ms = 18.2 fps, ~2.0s smooth loop
            loop=0,
            optimize=True
        )
        print(f'GIF saved to {p} ({os.path.getsize(p)} bytes)')

if __name__ == '__main__':
    generate_dragon_gif()
