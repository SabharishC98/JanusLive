import cv2, os, numpy as np
from PIL import Image

def main():
    video_path = r'C:\Users\sabha\.gemini\antigravity\brain\0df76df4-3b6e-4b76-b64c-fa95372f25b3\.user_uploaded\media_1795840743939_a7a041b5.mp4'
    cap = cv2.VideoCapture(video_path)
    raw_frames = []
    while True:
        ret, f = cap.read()
        if not ret: break
        raw_frames.append(f)
    cap.release()
    print(f'Loaded {len(raw_frames)} frames from newly uploaded video')

    # Static arena background extracted via temporal median filter
    bg = np.median(raw_frames[::5], axis=0).astype(np.float32)

    # Seamless landing touchdown from last frame back into frame 0
    f_last = raw_frames[-1].astype(np.float32)
    f0 = raw_frames[0].astype(np.float32)

    ink_last = np.clip(bg - f_last, 0, 255).astype(np.float32)
    ink0 = np.clip(bg - f0, 0, 255).astype(np.float32)

    gray_last = cv2.cvtColor(ink_last.astype(np.uint8), cv2.COLOR_BGR2GRAY)
    gray0 = cv2.cvtColor(ink0.astype(np.uint8), cv2.COLOR_BGR2GRAY)

    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    f_last_to_0 = dis.calc(gray_last, gray0, None)
    f_0_to_last = dis.calc(gray0, gray_last, None)

    h, w = gray_last.shape
    grid_y, grid_x = np.mgrid[0:h, 0:w].astype(np.float32)

    n_landing = 10
    landing_frames = []
    for i in range(1, n_landing):
        t = i / float(n_landing)
        ease = 1.0 - (1.0 - t) ** 3
        map0_x = (grid_x + ease * f_0_to_last[:, :, 0]).astype(np.float32)
        map0_y = (grid_y + ease * f_0_to_last[:, :, 1]).astype(np.float32)
        w0 = cv2.remap(ink_last, map0_x, map0_y, cv2.INTER_LINEAR)
        map1_x = (grid_x + (1.0 - ease) * f_last_to_0[:, :, 0]).astype(np.float32)
        map1_y = (grid_y + (1.0 - ease) * f_last_to_0[:, :, 1]).astype(np.float32)
        w1 = cv2.remap(ink0, map1_x, map1_y, cv2.INTER_LINEAR)
        blended = (1.0 - ease) * w0 + ease * w1
        frame = np.clip(bg - blended, 0, 255).astype(np.uint8)
        landing_frames.append(frame)

    full_sequence = raw_frames + landing_frames
    print(f'Total seamless sequence frames: {len(full_sequence)}')

    # SudarKalam 3-tier Temple Etching Theme Palette
    # Concise, high-contrast, pure deep background with vibrant gold/bronze and bright ivory
    def grade_frame(f):
        f_float = f.astype(np.float32) / 255.0
        lum = 0.299 * f_float[:, :, 2] + 0.587 * f_float[:, :, 1] + 0.114 * f_float[:, :, 0]
        
        # Invert: dark woodcut lines become bright ink, light paper becomes deep obsidian black
        ink = 1.0 - lum
        # Remap range to crush paper background to pure black
        ink = np.clip((ink - 0.04) / 0.86, 0.0, 1.0)
        ink = np.power(ink, 1.2) # High contrast gamma
        
        c_bg = np.array([7.0, 9.0, 9.0], dtype=np.float32) / 255.0         # #090907 Obsidian Black (BGR)
        c_bronze = np.array([54.0, 86.0, 108.0], dtype=np.float32) / 255.0 # #6C5636 Antique Bronze (BGR)
        c_ivory = np.array([235.0, 242.0, 245.0], dtype=np.float32) / 255.0 # #F5F2EB Ivory White (BGR)
        
        out = np.zeros_like(f_float)
        split = 0.38
        low_mask = ink < split
        high_mask = ink >= split
        t_low = ink / split
        t_high = (ink - split) / (1.0 - split)
        
        for c in range(3):
            out[:, :, c] = np.where(low_mask, c_bg[c] + t_low * (c_bronze[c] - c_bg[c]), 0)
            out[:, :, c] += np.where(high_mask, c_bronze[c] + t_high * (c_ivory[c] - c_bronze[c]), 0)
            
        out = np.clip(out * 255.0, 0, 255).astype(np.uint8)
        return out

    graded_sequence = [grade_frame(f) for f in full_sequence]

    # Target resolution: 720 x 411 (matching 1344 x 768 aspect ratio 1.75)
    target_w, target_h = 720, 411
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

    durations = [42] * len(quantized_frames) # ~24 FPS

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
