import argparse
import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def _register_ffmpeg_dlls():
    """Make the shared-build FFmpeg DLLs loadable regardless of the inherited PATH.

    torchaudio.load() decodes through torchcodec, which ctypes-loads
    libtorchcodec_core*.dll; those need avcodec/avformat/avutil... next to them on the
    DLL search path. scripts/install-ffmpeg-shared.ps1 puts them on the *User* PATH, but
    any process started before that (VSCode, and the `npm start` server plus this worker
    spawned from it) still carries the old PATH, so the load fails. Registering the
    directory explicitly removes that dependency on when the parent process started.
    """
    if sys.platform != "win32":
        return
    root = Path(os.environ.get("FFMPEG_SHARED_DIR") or
                Path(os.environ.get("LOCALAPPDATA", "")) / "ffmpeg-shared")
    if not root.is_dir():
        return
    for dll in root.rglob("avcodec-*.dll"):
        os.add_dll_directory(str(dll.parent))
        return


_register_ffmpeg_dlls()

parser = argparse.ArgumentParser()
parser.add_argument("--manifest", required=True)
parser.add_argument("--voice", default="Ly")
parser.add_argument("--ref-audio", required=True)
parser.add_argument("--ref-text", default="")
args = parser.parse_args()

try:
    from vieneu import Vieneu
except Exception as e:
    print(f"Failed to import VieNeu: {e}", file=sys.stderr)
    sys.exit(1)

manifest_path = Path(args.manifest).resolve()
data = json.loads(manifest_path.read_text(encoding="utf-8"))

story_dir = manifest_path.parent.parent
audio_dir = manifest_path.parent / "audio"
audio_dir.mkdir(parents=True, exist_ok=True)

ref_audio = Path(args.ref_audio).resolve()
if not ref_audio.exists():
    raise RuntimeError(f"Voice sample not found: {ref_audio}")

tts = Vieneu()

# VieNeu 2.7 supports preset voices and reference-audio cloning.
# For a custom sample, ref_audio is the important parameter.
# If ref_text is supplied, it is passed to the model as the transcript
# of the reference audio.
segments = data.get("segments", [])

for index, item in enumerate(segments, 1):
    output = story_dir / "tts" / item["output"]
    output.parent.mkdir(parents=True, exist_ok=True)

    if output.exists() and output.stat().st_size > 1000:
        print(f"[{index}/{len(segments)}] SKIP {output.name}")
        continue

    print(
        f"[{index}/{len(segments)}] "
        f"TTS {item['text'][:70]}..."
    )

    kwargs = {
        "ref_audio": str(ref_audio),
        "apply_watermark": True,
    }

    if args.ref_text.strip():
        kwargs["ref_text"] = args.ref_text.strip()

    try:
        audio = tts.infer(
            item["text"],
            **kwargs
        )
        tts.save(audio, output)
    except Exception as e:
        print(
            f"TTS failed at segment {index}: {e}",
            file=sys.stderr
        )
        sys.exit(1)

print("All TTS segments completed.")
