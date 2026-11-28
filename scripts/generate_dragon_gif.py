import cv2, os, numpy as np
from PIL import Image

def main():
    video_path = r'C:\Users\sabha\.gemini\antigravity\brain\0df76df4-3b6e-4b76-b64c-fa95372f25b3\.user_uploaded\media_1795789098260_6c7fb8a0.mp4'
    cap = cv2.VideoCapture(video_path)
    raw_frames = []
    while True:
        ret, f = cap.read()
        if not ret: break
        raw_frames.append(f)
    cap.release()
    print(f'Loaded {len(raw_frames)} frames from video')

    # Static arena background extracted via temporal median filter
    bg = np.median(raw_frames[::5], axis=0).astype(np.float32)

    def generate_flow_morph(src_frame, dst_frame, n_frames):
        ink_src = np.clip(bg - src_frame.astype(np.float32), 0, 255).astype(np.float32)
        ink_dst = np.clip(bg - dst_frame.astype(np.float32), 0, 255).astype(np.float32)
        gray_src = cv2.cvtColor(ink_src.astype(np.uint8), cv2.COLOR_BGR2GRAY)
        gray_dst = cv2.cvtColor(ink_dst.astype(np.uint8), cv2.COLOR_BGR2GRAY)
        dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        f_src_to_dst = dis.calc(gray_src, gray_dst, None)
        f_dst_to_src = dis.calc(gray_dst, gray_src, None)
        h, w = gray_src.shape
        grid_y, grid_x = np.mgrid[0:h, 0:w].astype(np.float32)
        out_frames = []
        for i in range(1, n_frames):
            t = i / float(n_frames)
            ease = 3.0 * (t ** 2) - 2.0 * (t ** 3)
            map0_x = (grid_x + ease * f_dst_to_src[:, :, 0]).astype(np.float32)
            map0_y = (grid_y + ease * f_dst_to_src[:, :, 1]).astype(np.float32)
            w0 = cv2.remap(ink_src, map0_x, map0_y, cv2.INTER_LINEAR)
            map1_x = (grid_x + (1.0 - ease) * f_src_to_dst[:, :, 0]).astype(np.float32)
            map1_y = (grid_y + (1.0 - ease) * f_src_to_dst[:, :, 1]).astype(np.float32)
            w1 = cv2.remap(ink_dst, map1_x, map1_y, cv2.INTER_LINEAR)
            blended = (1.0 - ease) * w0 + ease * w1
            frame = np.clip(bg - blended, 0, 255).astype(np.uint8)
            out_frames.append(frame)
        return out_frames

    # --- 1. ROUND 1: Takeoff & Full 360° Circuit (Frames 0 to 117) ---
    round_1 = raw_frames[0:118]

    # --- 2. MID-FLIGHT CONTINUOUS BRIDGE (Frames 117 -> 8) ---
    # Dragon flies over the pavilion in full forward flight and seamlessly enters Round 2
    mid_bridge = generate_flow_morph(raw_frames[117], raw_frames[8], 6)

    # --- 3. ROUND 2: Second Full 360° Circuit (Frames 8 to 116) ---
    round_2 = raw_frames[8:117]

    # --- 4. END OF ROUND 2: Organic Landing & Sitting Transition ---
    # Dragon returns to pavilion center at Frame 116, decelerates, folds wings, and settles onto perch
    ink116 = np.clip(bg - raw_frames[116].astype(np.float32), 0, 255).astype(np.float32)
    ink0 = np.clip(bg - raw_frames[0].astype(np.float32), 0, 255).astype(np.float32)
    gray116 = cv2.cvtColor(ink116.astype(np.uint8), cv2.COLOR_BGR2GRAY)
    gray0 = cv2.cvtColor(ink0.astype(np.uint8), cv2.COLOR_BGR2GRAY)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    f_116_to_0 = dis.calc(gray116, gray0, None)
    f_0_to_116 = dis.calc(gray0, gray116, None)
    h, w = gray116.shape
    grid_y, grid_x = np.mgrid[0:h, 0:w].astype(np.float32)

    n_landing = 16
    landing_frames = []
    for i in range(1, n_landing):
        t = i / float(n_landing)
        ease = 1.0 - (1.0 - t) ** 3
        map0_x = (grid_x + ease * f_0_to_116[:, :, 0]).astype(np.float32)
        map0_y = (grid_y + ease * f_0_to_116[:, :, 1]).astype(np.float32)
        w0 = cv2.remap(ink116, map0_x, map0_y, cv2.INTER_LINEAR)
        map1_x = (grid_x + (1.0 - ease) * f_116_to_0[:, :, 0]).astype(np.float32)
        map1_y = (grid_y + (1.0 - ease) * f_116_to_0[:, :, 1]).astype(np.float32)
        w1 = cv2.remap(ink0, map1_x, map1_y, cv2.INTER_LINEAR)
        blended = (1.0 - ease) * w0 + ease * w1
        frame = np.clip(bg - blended, 0, 255).astype(np.uint8)
        landing_frames.append(frame)

    # Full 2-round flight + landing sequence
    full_sequence = round_1 + mid_bridge + round_2 + landing_frames
    print(f'Total 2-round sequence frames: {len(full_sequence)}')

    # Temple etching 3-tier palette: Obsidian Black, Antique Bronze, Ivory White
    def grade(f):
        f_float = f.astype(np.float32) / 255.0
        lum = 0.299 * f_float[:, :, 2] + 0.587 * f_float[:, :, 1] + 0.114 * f_float[:, :, 0]
        ink = 1.0 - lum
        ink = np.clip((ink - 0.05) / 0.85, 0.0, 1.0)
        ink = np.power(ink, 1.1)

        c_bg = np.array([7.0, 9.0, 9.0], dtype=np.float32) / 255.0         # #090907 Obsidian Black
        c_bronze = np.array([54.0, 86.0, 108.0], dtype=np.float32) / 255.0 # #6C5636 Antique Bronze
        c_ivory = np.array([235.0, 242.0, 245.0], dtype=np.float32) / 255.0 # #F5F2EB Ivory White

        out = np.zeros_like(f_float)
        low_mask = ink < 0.45
        high_mask = ink >= 0.45
        t_low = ink / 0.45
        t_high = (ink - 0.45) / 0.55

        for c in range(3):
            out[:, :, c] = np.where(low_mask, c_bg[c] + t_low * (c_bronze[c] - c_bg[c]), 0)
            out[:, :, c] += np.where(high_mask, c_bronze[c] + t_high * (c_ivory[c] - c_bronze[c]), 0)

        out = np.clip(out * 255.0, 0, 255).astype(np.uint8)
        h_f, w_f, _ = out.shape
        corner = out[h_f-60:h_f, w_f-200:w_f]
        corner[corner < 45] = 8
        out[h_f-60:h_f, w_f-200:w_f] = corner
        return out

    graded_sequence = [grade(f) for f in full_sequence]

    # Downscale and quantize for performant client-side background playback
    target_w, target_h = 720, 405
    pil_frames = []
    for f in graded_sequence:
        r = cv2.resize(f, (target_w, target_h), interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(r, cv2.COLOR_BGR2RGB)
        pil_frames.append(Image.fromarray(rgb))

    sample_combo = Image.new('RGB', (target_w * 6, target_h))
    step = len(pil_frames) // 6
    for k in range(6):
        sample_combo.paste(pil_frames[min(k * step, len(pil_frames)-1)], (target_w * k, 0))
    base_pal = sample_combo.quantize(colors=128, method=Image.Quantize.FASTOCTREE)

    quantized_frames = [
        img.quantize(palette=base_pal, dither=Image.Dither.FLOYDSTEINBERG)
        for img in pil_frames
    ]

    out_paths = [
        'public/images/sudarkalam_dragon_flight.gif',
        r'C:\Users\sabha\.gemini\antigravity\brain\0df76df4-3b6e-4b76-b64c-fa95372f25b3\sudarkalam_dragon_flight.gif'
    ]

    durations = [50] * len(quantized_frames)

    for p in out_paths:
        quantized_frames[0].save(
            p,
            save_all=True,
            append_images=quantized_frames[1:],
            duration=durations,
            loop=0,
            optimize=True
        )
        sz = os.path.getsize(p)
        print(f'Exported {p}: {sz / (1024*1024):.2f} MB')

if __name__ == '__main__':
    main()
