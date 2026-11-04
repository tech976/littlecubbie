"""Cut short preview clips from the original cubbie story recordings.

The full stories are the product, so the page only ever gets a taste:
  story  – the opening (about 10–25 s), ending on a sentence with a soft fade
  hello  – the cubbie's own greeting
  night  – a sign-off line, used at bedtime

Originals live in Audios/ (git-ignored, never deployed). Outputs:
  site/assets/audio/<id>-<clip>.mp3
  site/voices.js   (clip paths + word start times for the caption highlight)

Caption text comes from site/cubbies.js (line / say / night).
Usage (needs ffmpeg and: pip install faster-whisper):
  python tools/make-snippets.py
"""
import difflib, json, os, re, subprocess

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIOS = os.path.join(ROOT, "Audios")
SR = 44100

# Times are seconds in the original file; negative times count back from the end.
# Several (start, end) pairs are joined with a tiny crossfade.
SPEC = {
    "ganesh":  {"file": "Lord Ganesh - A109.mp3",  "story": [(0.0, 14.8)],                 "hello": [(2.3, 5.0)],   "night": [(47.35, 51.3)]},
    "hanuman": {"file": "Lord Hanuman - A0ZX.mp3", "story": [(0.0, 23.55)],                "hello": [(2.35, 7.2)],  "night": [(-4.0, -0.05)]},
    "ram":     {"file": "Lord Ram - A11J.mp3",     "story": [(0.0, 17.8)],                 "hello": [(0.0, 3.0)],   "night": [(-12.55, -5.2)]},
    "krishna": {"file": "Bal Krishna - A0TY.mp3",  "story": [(10.6, 13.05), (38.6, 48.9)], "hello": [(10.6, 13.05)], "night": [(49.2, 55.2)]},
    "bheem":   {"file": "Bal Bheem - A0XB.mp3",    "story": [(0.0, 17.85)],                "hello": [(0.0, 2.7)],   "night": [(-5.5, -0.05)]},
    "birbal":  {"file": "Birbal - A0YK.mp3",       "story": [(0.0, 12.4)],                 "hello": [(2.5, 6.65)],  "night": [(-20.25, -14.7)]},
    "tenali":  {"file": "Tenali Rama - A0Z1.mp3",  "story": [(0.0, 16.98)],                "hello": [(0.0, 4.6)],   "night": [(-18.5, -12.6)]},
}
FADE_OUT = {"story": 0.6, "hello": 0.15, "night": 0.25}
MAX_STORY = 26.0  # hard cap so a preview can never become the product


def load_cubbies():
    js = "import('./site/cubbies.js').then(m => console.log(JSON.stringify(m.CUBBIES)))"
    out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return {c["id"]: c for c in json.loads(out)}


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def quietest(audio, t, lo, hi):
    """Move a cut to the quietest 10 ms within [t+lo, t+hi] so no word is clipped."""
    a, b = max(0, int((t + lo) * SR)), min(len(audio), int((t + hi) * SR))
    if b - a < SR // 50:
        return t
    win = SR // 100
    frames = audio[a:b][: (b - a) // win * win].reshape(-1, win)
    rms = np.sqrt((frames ** 2).mean(axis=1))
    return (a + int(rms.argmin()) * win + win // 2) / SR


def cut(audio, parts, kind):
    dur = len(audio) / SR
    pieces = []
    for s, e in parts:
        s = s + dur if s < 0 else s
        e = e + dur if e < 0 else e
        s = 0.0 if s <= 0.05 else quietest(audio, s, -0.3, 0.08)
        e = min(dur, quietest(audio, e, -0.08, 0.3))
        seg = audio[int(s * SR):int(e * SR)].copy()
        n = int(0.03 * SR)
        seg[:n] *= np.linspace(0, 1, n)
        seg[-n:] *= np.linspace(1, 0, n)
        pieces.append(seg)
    out = np.concatenate(pieces)
    n = int(FADE_OUT[kind] * SR)
    out[-n:] *= np.linspace(1, 0, n) ** 1.5
    return np.concatenate([out, np.zeros(int(0.12 * SR), dtype=np.float32)])


def encode(audio, path):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(SR), "-c:a", "libmp3lame", "-b:a", "64k", path],
                   input=audio.tobytes(), check=True)


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def word_times(model, path, text):
    """Start time of each caption word, from a transcript of the clip aligned to the caption."""
    segs, _ = model.transcribe(path, language="en", word_timestamps=True)
    heard = [(w.start, norm(w.word)) for s in segs for w in s.words if norm(w.word)]
    caption = text.split()
    cap = [norm(w) for w in caption]
    times = [None] * len(caption)
    sm = difflib.SequenceMatcher(a=cap, b=[h[1] for h in heard], autojunk=False)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            times[blk.a + k] = heard[blk.b + k][0]
    # fill gaps by spacing words evenly between known neighbours
    known = [i for i, t in enumerate(times) if t is not None]
    if not known:
        return [round(i * 0.33, 3) for i in range(len(caption))]
    for i in range(len(times)):
        if times[i] is None:
            prev = max([k for k in known if k < i], default=None)
            nxt = min([k for k in known if k > i], default=None)
            if prev is None:
                times[i] = max(0.0, times[nxt] - 0.3 * (nxt - i))
            elif nxt is None:
                times[i] = times[prev] + 0.3 * (i - prev)
            else:
                times[i] = times[prev] + (times[nxt] - times[prev]) * (i - prev) / (nxt - prev)
    for i in range(1, len(times)):
        times[i] = max(times[i], times[i - 1])
    return [round(t, 3) for t in times]


def main():
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    cubbies = load_cubbies()
    os.makedirs(os.path.join(ROOT, "site/assets/audio"), exist_ok=True)
    voices = {}
    for cid, spec in SPEC.items():
        audio = decode(os.path.join(AUDIOS, spec["file"]))
        voices[cid] = {}
        for kind in ("story", "hello", "night"):
            clip = cut(audio, spec[kind], kind)
            secs = len(clip) / SR
            assert kind != "story" or secs <= MAX_STORY, f"{cid} story preview too long ({secs:.1f}s)"
            rel = f"assets/audio/{cid}-{kind}.mp3"
            path = os.path.join(ROOT, "site", rel)
            encode(clip, path)
            entry = {"src": rel}
            if kind == "story":
                entry["words"] = word_times(model, path, cubbies[cid]["line"])
            voices[cid][kind] = entry
            print(f"{cid:8} {kind:5} {secs:5.1f}s of {len(audio) / SR:5.0f}s")
    with open(os.path.join(ROOT, "site/voices.js"), "w") as f:
        f.write("// Generated by tools/make-snippets.py from the original recordings. Do not edit by hand.\n")
        f.write("// Short previews only: the full stories stay in the product.\n")
        f.write("export const VOICES = " + json.dumps(voices, indent=1) + ";\n")
    print("wrote site/voices.js")


if __name__ == "__main__":
    main()
