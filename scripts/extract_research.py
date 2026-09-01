#!/usr/bin/env python3
"""Extract readable text from page_reader JSON outputs for research synthesis."""
import json
import re
import sys
from pathlib import Path

RESEARCH = Path("/home/z/my-project/research")


def clean_html(html: str) -> str:
    html = re.sub(r"<script[^>]*>[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[^>]*>[\s\S]*?</style>", " ", html, flags=re.I)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    html = re.sub(r"</(p|div|li|h[1-6]|tr)>", "\n", html, flags=re.I)
    html = re.sub(r"<[^>]+>", " ", html)
    html = html.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in html.split("\n")]
    return "\n".join([ln for ln in lines if ln])


def main():
    for name in sys.argv[1:]:
        p = RESEARCH / name
        if not p.exists():
            print(f"=== {name}: MISSING ===")
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        d = data.get("data", data) if isinstance(data, dict) else {}
        title = d.get("title", "")
        desc = d.get("description", "")
        content = d.get("html") or d.get("text") or ""
        print(f"\n{'='*70}\n### FILE: {name}\nTITLE: {title}\nDESC: {desc}\n{'-'*70}")
        text = clean_html(content) if content else "(no content)"
        print(text[:6000])


if __name__ == "__main__":
    main()
