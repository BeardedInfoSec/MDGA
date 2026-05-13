"""One-shot: render README.md to README.pdf via headless Edge.

Reads README.md, embeds it base64 into a self-contained HTML file that uses
marked.js from CDN to render, then invokes headless Edge with --print-to-pdf.
Cleans up the temp HTML afterwards.
"""
import base64
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MD_PATH = ROOT / "README.md"
HTML_PATH = ROOT / ".readme-render.html"
PDF_PATH = ROOT / "README.pdf"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

md_content = MD_PATH.read_text(encoding="utf-8")
md_b64 = base64.b64encode(md_content.encode("utf-8")).decode("ascii")

HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MDGA README</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  html, body { background: #fff; color: #1a1a1a; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.5;
    max-width: 100%;
    margin: 0;
    padding: 0;
  }
  h1 { font-size: 22pt; border-bottom: 2px solid #B91C1C; padding-bottom: 6px; margin-top: 0; color: #B91C1C; }
  h2 { font-size: 16pt; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 28px; color: #1a1a1a; page-break-after: avoid; }
  h3 { font-size: 13pt; margin-top: 20px; color: #333; page-break-after: avoid; }
  h4 { font-size: 11pt; margin-top: 16px; color: #444; page-break-after: avoid; }
  p, ul, ol { margin: 8px 0; }
  ul, ol { padding-left: 22px; }
  li { margin: 3px 0; }
  hr { border: 0; border-top: 1px solid #ccc; margin: 24px 0; }
  code {
    font-family: "Cascadia Code", Consolas, "Courier New", monospace;
    font-size: 9pt;
    background: #f4f4f4;
    border-radius: 3px;
    padding: 1px 4px;
    color: #B91C1C;
  }
  pre {
    background: #f6f8fa;
    border: 1px solid #e1e4e8;
    border-radius: 4px;
    padding: 10px 12px;
    overflow-x: auto;
    page-break-inside: avoid;
  }
  pre code {
    background: transparent;
    padding: 0;
    color: #24292e;
    font-size: 8.5pt;
    line-height: 1.4;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 10px 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #ddd;
    padding: 5px 8px;
    text-align: left;
    vertical-align: top;
  }
  th { background: #f4f4f4; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  a { color: #B91C1C; text-decoration: none; }
  blockquote {
    border-left: 3px solid #B91C1C;
    margin: 10px 0;
    padding: 4px 12px;
    color: #555;
    background: #fafafa;
  }
  strong { color: #1a1a1a; }
</style>
</head>
<body>
<div id="content">Loading...</div>
<script>
  const bytes = Uint8Array.from(atob("__MD_B64__"), c => c.charCodeAt(0));
  const md = new TextDecoder('utf-8').decode(bytes);
  marked.setOptions({ gfm: true, breaks: false, headerIds: true });
  document.getElementById('content').innerHTML = marked.parse(md);
  document.title = "MDGA README ready";
</script>
</body>
</html>
"""

HTML_PATH.write_text(HTML.replace("__MD_B64__", md_b64), encoding="utf-8")

cmd = [
    EDGE,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=10000",
    f"--print-to-pdf={PDF_PATH}",
    "--print-to-pdf-no-header",
    HTML_PATH.as_uri(),
]

print("Running:", " ".join(f'"{c}"' if " " in c else c for c in cmd))
result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
print("STDOUT:", result.stdout[-500:] if result.stdout else "(empty)")
print("STDERR:", result.stderr[-500:] if result.stderr else "(empty)")
print("Exit:", result.returncode)

try:
    HTML_PATH.unlink()
except OSError:
    pass

if PDF_PATH.exists():
    size = PDF_PATH.stat().st_size
    print(f"OK: {PDF_PATH} ({size:,} bytes)")
else:
    print("FAILED: PDF not generated")
    sys.exit(1)
