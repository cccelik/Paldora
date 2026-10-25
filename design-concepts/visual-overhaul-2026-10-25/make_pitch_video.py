"""Render a short, self-contained Paldora concept pitch from the eight mockups.

Requires Pillow, NumPy, and ffmpeg. Run from any directory with:
python3 design-concepts/visual-overhaul-2026-10-25/make_pitch_video.py
"""

from __future__ import annotations

import math
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1920, 1080
FPS = 24
TRANSITION = 0.6
OUTPUT = ROOT / "paldora-visual-directions-pitch.mp4"

SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SANS = "/System/Library/Fonts/Avenir.ttc"

SCENES = [
    ("A-editorial-archive.png", "Editorial\nArchive", "Warm, personal, enduring", "An artful home for the moments worth keeping.", "#DCE6D7", "#244532"),
    ("B-quiet-modern.png", "Quiet\nModern", "Clear, calm, contemporary", "Everyday connection with room to breathe.", "#DEE5FA", "#172C63"),
    ("C-night-gallery.png", "Night\nGallery", "Immersive, intimate, cinematic", "Give your memories the space they deserve.", "#26292B", "#D9A084"),
    ("D-gilded-hearth.png", "Gilded\nHearth", "Golden, welcoming, refined", "A private place that feels like coming home.", "#EDE2C8", "#8B6732"),
    ("E-velvet-violet.png", "Velvet\nViolet", "Expressive, soft, distinctive", "The familiar people who color your world.", "#E6D6E5", "#654265"),
    ("F-burgundy-library.png", "Burgundy\nLibrary", "Cultivated, rich, warm", "A living album with stories between the photos.", "#E8D3CD", "#743638"),
    ("G-sage-atelier.png", "Sage\nAtelier", "Natural, serene, thoughtful", "Small moments, beautifully kept together.", "#DDE5D7", "#4F674A"),
    ("H-blue-hour-residence.png", "Blue Hour\nResidence", "Timeless, cozy, composed", "A quieter evening with your favorite people.", "#D9E7EE", "#21495B"),
]


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def rgb(hex_color: str) -> tuple[int, int, int]:
    return tuple(bytes.fromhex(hex_color.removeprefix("#")))  # type: ignore[return-value]


def center_text(draw: ImageDraw.ImageDraw, text: str, y: int, face: ImageFont.FreeTypeFont, fill: str) -> None:
    box = draw.textbbox((0, 0), text, font=face)
    draw.text(((WIDTH - (box[2] - box[0])) // 2, y), text, font=face, fill=fill)


def wrapped_text(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont, width: int) -> str:
    lines: list[str] = []
    line = ""
    for word in text.split():
        candidate = f"{line} {word}" if line else word
        if line and draw.textlength(candidate, font=face) > width:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return "\n".join(lines)


def title_card() -> Image.Image:
    canvas = Image.new("RGB", (WIDTH, HEIGHT), "#171612")
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((72, 70, WIDTH - 72, HEIGHT - 70), radius=28, outline="#514631", width=2)
    d.ellipse((1530, -220, 2260, 510), fill="#282218")
    d.ellipse((-300, 760, 340, 1400), fill="#22251D")
    center_text(d, "Paldora", 200, font(SERIF, 126), "#F6F0E5")
    d.line((825, 395, 1095, 395), fill="#B8975A", width=3)
    center_text(d, "A MORE BEAUTIFUL HOME", 465, font(SANS, 34), "#D5BD85")
    center_text(d, "FOR YOUR PEOPLE", 520, font(SANS, 34), "#D5BD85")
    center_text(d, "Eight visual directions for a private social scrapbook", 665, font(SERIF, 42), "#F6F0E5")
    center_text(d, "Private by design  ·  Personal by feeling", 790, font(SANS, 28), "#B9B2A3")
    return canvas


def concept_card(index: int, scene: tuple[str, str, str, str, str, str]) -> Image.Image:
    filename, title, qualities, pitch, pale, accent = scene
    dark = filename.startswith("C-")
    bg = "#17191B" if dark else "#F6F3ED"
    ink = "#F6F0E5" if dark else "#201D19"
    muted = "#B7B3AB" if dark else "#706D65"
    canvas = Image.new("RGB", (WIDTH, HEIGHT), bg)
    d = ImageDraw.Draw(canvas)
    d.rectangle((0, 0, 22, HEIGHT), fill=accent)
    d.text((90, 80), "PALDORA  /  VISUAL DIRECTIONS", font=font(SANS, 25), fill=muted)
    d.rounded_rectangle((86, 190, 235, 242), radius=24, fill=pale)
    d.text((114, 196), f"{index:02d} / 08", font=font(SANS, 29), fill=accent if not dark else "#17191B")
    d.multiline_text((85, 302), title, font=font(SERIF, 69), fill=ink, spacing=8)
    d.line((88, 560, 448, 560), fill=accent, width=4)
    d.multiline_text((87, 600), wrapped_text(d, qualities, font(SANS, 27), 390), font=font(SANS, 27), fill=accent, spacing=6)
    d.multiline_text((87, 710), wrapped_text(d, pitch, font(SERIF, 31), 390), font=font(SERIF, 31), fill=ink, spacing=12)
    d.text((90, 997), "PRIVATE BOXES  •  REAL MEMORIES", font=font(SANS, 22), fill=muted)

    mockup = Image.open(ROOT / filename).convert("RGB")
    mockup.thumbnail((1350, 940), Image.Resampling.LANCZOS)
    x = 515 + (1350 - mockup.width) // 2
    y = 70 + (940 - mockup.height) // 2
    shadow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x - 8, y - 8, x + mockup.width + 8, y + mockup.height + 8), radius=22, fill=(0, 0, 0, 85))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(22)))
    canvas.paste(mockup, (x, y))
    return canvas.convert("RGB")


def closing_card() -> Image.Image:
    canvas = Image.new("RGB", (WIDTH, HEIGHT), "#F6F3ED")
    d = ImageDraw.Draw(canvas)
    d.rectangle((0, 0, WIDTH, 20), fill="#9A7846")
    center_text(d, "Paldora", 160, font(SERIF, 112), "#24211B")
    center_text(d, "Eight directions. One place that feels like yours.", 395, font(SERIF, 53), "#24211B")
    center_text(d, "An elegant home for private moments and the people in them.", 520, font(SANS, 32), "#6F685B")
    swatches = ["#244532", "#172C63", "#26292B", "#A78443", "#654265", "#743638", "#4F674A", "#21495B"]
    start, gap, size = 250, 21, 155
    for i, color in enumerate(swatches):
        x = start + i * (size + gap)
        d.rounded_rectangle((x, 700, x + size, 855), radius=24, fill=color)
        d.text((x + 62, 875), chr(65 + i), font=font(SANS, 27), fill="#5A554E")
    center_text(d, "PRIVATE BY DESIGN", 990, font(SANS, 25), "#8C714B")
    return canvas


def make_music(path: Path, duration: float) -> None:
    """A quiet original ambient progression; no external music asset."""
    sample_rate = 44_100
    count = int((duration + 0.5) * sample_rate)
    track = np.zeros(count, dtype=np.float32)
    chords = [
        [130.81, 164.81, 196.0, 246.94],
        [110.0, 146.83, 174.61, 220.0],
        [98.0, 123.47, 146.83, 196.0],
        [116.54, 146.83, 174.61, 233.08],
    ]
    segment = 8.0
    for start in np.arange(0, duration + segment, segment):
        first = int(start * sample_rate)
        if first >= count:
            break
        n = min(int(segment * sample_rate), count - first)
        t = np.arange(n, dtype=np.float32) / sample_rate
        envelope = np.minimum(1.0, t / 1.4) * np.minimum(1.0, (segment - t) / 1.5)
        chord = chords[int(start / segment) % len(chords)]
        for frequency in chord:
            tone = np.sin(2 * math.pi * frequency * t)
            overtone = 0.14 * np.sin(2 * math.pi * frequency * 2 * t)
            track[first : first + n] += (tone + overtone) * envelope * 0.024
        for beat in (0.0, 2.0, 4.0, 6.0):
            offset = int(beat * sample_rate)
            length = min(int(1.7 * sample_rate), n - offset)
            if length <= 0:
                continue
            u = np.arange(length, dtype=np.float32) / sample_rate
            bell = np.sin(2 * math.pi * chord[-1] * 2 * u) * np.exp(-3.1 * u)
            track[first + offset : first + offset + length] += 0.025 * bell
    t_all = np.arange(count, dtype=np.float32) / sample_rate
    fade = np.minimum(1.0, t_all / 2.0) * np.minimum(1.0, (duration - t_all) / 2.8)
    track = np.clip(track * np.clip(fade, 0.0, 1.0), -0.9, 0.9)
    pcm = (track * 32767).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())


def render() -> None:
    durations = [4.5] + [5.0] * 8 + [5.0]
    total = sum(durations) - TRANSITION * (len(durations) - 1)
    with tempfile.TemporaryDirectory(prefix="paldora-pitch-") as temp:
        temp_path = Path(temp)
        images = [title_card()] + [concept_card(i, scene) for i, scene in enumerate(SCENES, 1)] + [closing_card()]
        slide_paths = []
        for i, img in enumerate(images):
            path = temp_path / f"slide-{i:02d}.png"
            img.save(path, optimize=True)
            slide_paths.append(path)
        images[-1].save(ROOT / "pitch-video-cover.png", optimize=True)
        audio_path = temp_path / "ambient.wav"
        make_music(audio_path, total)

        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
        for path, duration in zip(slide_paths, durations):
            command += ["-loop", "1", "-framerate", str(FPS), "-t", str(duration), "-i", str(path)]
        command += ["-i", str(audio_path)]
        filters = []
        for i, duration in enumerate(durations):
            filters.append(f"[{i}:v]fps={FPS},format=yuv420p,trim=duration={duration},setpts=PTS-STARTPTS[v{i}]")
        current = "v0"
        elapsed = durations[0]
        for i in range(1, len(durations)):
            next_label = f"x{i}"
            filters.append(f"[{current}][v{i}]xfade=transition=fade:duration={TRANSITION}:offset={elapsed - TRANSITION}[{next_label}]")
            current = next_label
            elapsed += durations[i] - TRANSITION
        command += [
            "-filter_complex", ";".join(filters),
            "-map", f"[{current}]", "-map", f"{len(durations)}:a",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
            "-r", str(FPS), "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
            "-shortest", str(OUTPUT),
        ]
        subprocess.run(command, check=True)
    print(f"Rendered {OUTPUT} ({total:.1f}s)")


if __name__ == "__main__":
    render()
