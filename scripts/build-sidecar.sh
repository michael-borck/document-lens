#!/usr/bin/env bash
# Build the document-analyser PyInstaller sidecar and stage it for Tauri.
set -euo pipefail

ROOT="$(pwd)"
TARGET="${TAURI_TARGET:?TAURI_TARGET is required}"

if [ "${RUNNER_OS:-}" = "Windows" ] || [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]]; then
  EXT=".exe"
  SEP=";"
  git config --system core.longpaths true || true
  powershell.exe -NoProfile -Command "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -Name LongPathsEnabled -Value 1 -Force" || true
else
  EXT=""
  SEP=":"
fi

python -m pip install --disable-pip-version-check uv
uv python install 3.11

if [ ! -d document-analyser-backend/.git ]; then
  rm -rf document-analyser-backend
  git clone --depth 1 https://github.com/michael-borck/document-analyser.git document-analyser-backend
else
  git -C document-analyser-backend fetch --depth 1 origin main
  git -C document-analyser-backend reset --hard origin/main
fi

rm -rf .venv-sidecar
uv venv --python 3.11 --seed .venv-sidecar
if [ -f .venv-sidecar/bin/activate ]; then
  source .venv-sidecar/bin/activate
else
  source .venv-sidecar/Scripts/activate
fi

cd document-analyser-backend
python -m pip install --upgrade pip
python -m pip install pyinstaller
if [ "${RUNNER_OS:-}" = "Linux" ]; then
  python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
fi
python -m pip install -e ".[nlp]"
python -m pip install "setuptools<81"

cd "$ROOT"
python - <<'PY'
import io
import os
import time
import urllib.request
import zipfile

base = "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages"
packages = {
    "tokenizers/punkt": "tokenizers",
    "tokenizers/punkt_tab": "tokenizers",
    "taggers/averaged_perceptron_tagger": "taggers",
    "taggers/averaged_perceptron_tagger_eng": "taggers",
    "corpora/stopwords": "corpora",
    "corpora/cmudict": "corpora",
}
out = os.path.join(os.getcwd(), "nltk_data")
for pkg, sub in packages.items():
    url = f"{base}/{pkg}.zip"
    dest = os.path.join(out, sub)
    os.makedirs(dest, exist_ok=True)
    for attempt in range(1, 6):
        try:
            data = urllib.request.urlopen(url, timeout=60).read()
            zipfile.ZipFile(io.BytesIO(data)).extractall(dest)
            print("OK", pkg)
            break
        except Exception as e:
            if attempt == 5:
                raise SystemExit(f"NLTK fetch failed for {pkg}: {e}")
            time.sleep(min(60, 5 * 2 ** (attempt - 1)))
PY

mkdir -p hf_cache
HF_TOKEN="${HF_TOKEN:-}" python - <<'PY'
import os
import time

os.environ["HF_HOME"] = os.path.abspath("hf_cache")
from huggingface_hub import snapshot_download

token = os.environ.get("HF_TOKEN") or None
ignore = ["onnx/**", "openvino/**", "*.onnx", "tf_model.h5", "flax_model.msgpack", "rust_model.ot"]
for attempt in range(1, 6):
    try:
        snapshot_download("sentence-transformers/all-MiniLM-L6-v2", ignore_patterns=ignore, token=token)
        break
    except Exception as e:
        if attempt == 5:
            raise SystemExit(f"Model prefetch failed: {e}")
        time.sleep(min(60, 5 * 2 ** (attempt - 1)))
PY

cd "$ROOT/document-analyser-backend"
cat > run_server.py <<'ENTRYPOINT'
#!/usr/bin/env python3
import multiprocessing; multiprocessing.freeze_support()
import sys, os, argparse, tempfile
if getattr(sys, 'frozen', False):
    app_temp = os.path.join(tempfile.gettempdir(), 'document-lens-temp')
    os.makedirs(app_temp, exist_ok=True)
    os.environ['TMPDIR'] = os.environ['TEMP'] = os.environ['TMP'] = app_temp
    nltk_data_path = os.path.join(sys._MEIPASS, 'nltk_data')
    if os.path.exists(nltk_data_path):
        import nltk; nltk.data.path.insert(0, nltk_data_path)
    hf_cache_path = os.path.join(sys._MEIPASS, 'hf_cache')
    if os.path.exists(hf_cache_path):
        os.environ['HF_HOME'] = hf_cache_path
        os.environ['HF_HUB_CACHE'] = os.path.join(hf_cache_path, 'hub')
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
import uvicorn
from document_analyser.api import app as fastapi_app
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    uvicorn.run(fastapi_app, host=args.host, port=args.port, log_level="info")
ENTRYPOINT

cp -r "$ROOT/nltk_data" ./nltk_data
cp -rL "$ROOT/hf_cache" ./hf_cache
rm -rf ./hf_cache/hub/*/blobs
pyinstaller --onefile --console --name "document-lens-api" \
  --add-data "document_analyser/data${SEP}document_analyser/data" \
  --add-data "nltk_data${SEP}nltk_data" \
  --add-data "hf_cache${SEP}hf_cache" \
  --collect-all sentence_transformers --collect-all transformers --collect-all torch \
  --collect-all huggingface_hub --collect-all tokenizers --collect-all safetensors \
  --collect-all magika --collect-all markitdown \
  --hidden-import uvicorn.logging --hidden-import uvicorn.lifespan --hidden-import uvicorn.lifespan.on \
  --hidden-import uvicorn.lifespan.off --hidden-import uvicorn.protocols \
  --hidden-import uvicorn.protocols.http --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.http.h11_impl --hidden-import uvicorn.protocols.http.httptools_impl \
  --hidden-import uvicorn.protocols.websockets --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import uvicorn.protocols.websockets.websockets_impl --hidden-import uvicorn.protocols.websockets.wsproto_impl \
  --hidden-import uvicorn.loops --hidden-import uvicorn.loops.auto --hidden-import uvicorn.loops.asyncio \
  --hidden-import uvicorn.loops.uvloop --hidden-import fastapi --hidden-import pydantic --hidden-import slowapi \
  --hidden-import textstat --hidden-import nltk --hidden-import sklearn --hidden-import pypdf \
  --hidden-import pdfplumber --hidden-import python_multipart --hidden-import multipart \
  --hidden-import starlette.formparsers --hidden-import keyring.backends \
  --exclude-module tensorflow --exclude-module keras --exclude-module matplotlib --exclude-module cv2 \
  --exclude-module spacy --exclude-module en_core_web_sm --exclude-module thinc --exclude-module blis \
  run_server.py

mkdir -p "$ROOT/src-tauri/binaries"
cp "dist/document-lens-api$EXT" "$ROOT/src-tauri/binaries/document-lens-api-$TARGET$EXT"
ls -la "$ROOT/src-tauri/binaries/"
