"""Nghe một file audio thành văn bản, để rút Ý TƯỞNG khi video không có phụ đề.

Chạy bởi src/youtube.ts qua YT_PYTHON. Tách thành file riêng chứ không nhét vào
`python -c` để còn đọc được và còn sửa được mà không phải né dấu nháy của shell.

Bản ghi này KHÔNG BAO GIỜ được ghi vào thư mục truyện: nó đi thẳng vào prompt IDEA
rồi biến mất cùng thư mục tạm, đúng như bản ghi lấy từ phụ đề.
"""
import argparse, glob, itertools, os, sys, sysconfig

# Trên Windows, ctranslate2 không tự tìm được cuBLAS/cuDNN dù chúng đã được cài bằng pip:
# các wheel nvidia-* đặt DLL trong site-packages/nvidia/*/bin, chỗ mà Windows không dò tới.
# PyTorch tự nạp phần này nên torch chạy GPU bình thường, và chính điều đó làm sự cố khó
# đoán - máy có GPU, có driver, có cả DLL, mà ctranslate2 vẫn chết ở "cublas64_12.dll is
# not found". Khai báo thư mục ngay tại đây, TRƯỚC khi import faster_whisper, thay vì bắt
# người dùng sửa PATH của cả máy cho một tiến trình con.
def _add_cuda_dll_dirs() -> int:
    if not hasattr(os, "add_dll_directory"):
        return 0
    root = os.path.join(sysconfig.get_paths()["purelib"], "nvidia")
    found = 0
    for d in sorted({os.path.dirname(f) for f in glob.glob(os.path.join(root, "**", "*.dll"), recursive=True)}):
        try:
            os.add_dll_directory(d)
        except OSError:
            pass
        # add_dll_directory một mình KHÔNG đủ, và đây là chỗ dễ tưởng đã xong: nó chỉ có tác
        # dụng với LoadLibraryEx dùng cờ tìm kiếm mới, còn ctranslate2 nạp cuBLAS bằng
        # LoadLibrary trần - thứ duy nhất nó nhìn là PATH. Đã thử: khai báo 3 thư mục xong
        # vẫn chết y nguyên. Phải làm cả hai, và PATH này chỉ sống trong tiến trình con.
        os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")
        found += 1
    return found

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="large-v3-turbo")
    ap.add_argument("--language", default="vi")
    args = ap.parse_args()
    # Console Windows mặc định không phải UTF-8, nên tiếng Việt trong log tiến trình về
    # thành rác và người đọc log không biết chuyện gì đang xảy ra.
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    print(f"[asr] cuda dll dirs: {_add_cuda_dll_dirs()}", file=sys.stderr, flush=True)
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("THIEU_FASTER_WHISPER", file=sys.stderr)
        return 3

    import ctranslate2
    # float16 trên GPU nhanh hơn nhiều lần; máy không có CUDA thì int8 trên CPU vẫn chạy,
    # chỉ chậm. Chọn ngầm chứ không bắt người dùng khai báo.
    gpu = ctranslate2.get_cuda_device_count() > 0
    device, compute = ("cuda", "float16") if gpu else ("cpu", "int8")
    print(f"[asr] device={device} compute={compute} model={args.model}", file=sys.stderr, flush=True)

    # Đây là chỗ đã hỏng thật một lần: ctranslate2 báo có CUDA device, nên bản đầu chọn
    # thẳng "cuda" - rồi chết ở đoạn đầu tiên với "cublas64_12.dll is not found", vì thấy
    # GPU không có nghĩa là nạp được cuBLAS/cuDNN. Và nó chết LƯỜI, tận lúc giải mã đoạn
    # đầu chứ không phải lúc dựng model, nên không thể hỏi trước bằng một câu điều kiện.
    # Cách duy nhất biết chắc là thử: nghe thật đoạn đầu, hỏng thì dựng lại trên CPU.
    def transcribe(dev: str, comp: str):
        m = WhisperModel(args.model, device=dev, compute_type=comp)
        segs, info = m.transcribe(
            args.audio, language=args.language, vad_filter=True,
            condition_on_previous_text=False, beam_size=5)
        it = iter(segs)
        first = next(it, None)          # ép giải mã ngay tại đây, còn kịp lùi
        return first, it, info

    try:
        first, rest, info = transcribe(device, compute)
    except Exception as e:
        if device == "cpu":
            raise
        print(f"[asr] GPU không dùng được ({type(e).__name__}: {e}), chuyển sang CPU", file=sys.stderr, flush=True)
        device, compute = "cpu", "int8"
        print(f"[asr] device={device} compute={compute}", file=sys.stderr, flush=True)
        first, rest, info = transcribe(device, compute)

    print(f"[asr] duration={info.duration:.0f}s", file=sys.stderr, flush=True)
    parts, nudge = [], 0.0
    # KHÔNG dùng `[first] + list(rest)`: list() vắt cạn generator TRƯỚC khi thân vòng lặp
    # chạy lần nào, nên toàn bộ việc giải mã diễn ra im lặng rồi mọi dòng tiến trình mới in
    # ra một loạt ở cuối. Đo trên video 47 phút: cả 46 dòng cùng đóng dấu giây thứ 96. Một
    # thanh tiến trình chỉ xuất hiện khi đã xong thì tệ hơn là không có, vì nó nói dối.
    for seg in itertools.chain([first] if first else [], rest):
        text = seg.text.strip()
        if text:
            parts.append(text)
        if seg.end - nudge >= 60:
            nudge = seg.end
            print(f"[asr] {seg.end:.0f}s/{info.duration:.0f}s", file=sys.stderr, flush=True)

    with open(args.out, "w", encoding="utf-8") as f:
        f.write(" ".join(parts))
    print(f"[asr] xong, {len(parts)} đoạn", file=sys.stderr, flush=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())
