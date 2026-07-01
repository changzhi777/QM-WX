#!/usr/bin/env python3
"""Build review-package.html and review-package.pdf from the four markdown docs.
Usage: python3 build_docs.py  (run from docs/ directory)"""
import markdown, pathlib, datetime

DOCS = ["README.md", "01-code-review.md", "02-architecture.md",
        "03-product-prototype.md", "04-task-breakdown.md",
        "05-payment.md", "06-device-integration.md", "07-food-nutrition-apis.md",
        "08-recipe-ingestion-and-ludong.md", "09-code-optimization.md"]
HERE = pathlib.Path(__file__).parent

CSS = """
@page { size: A4; margin: 18mm 15mm; @bottom-center { content: counter(page) " / " counter(pages); font-size: 9px; color:#999; } }
* { box-sizing: border-box; }
body { font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
       "Droid Sans Fallback", sans-serif; color:#1f2937; line-height:1.7; font-size:14px;
       max-width: 920px; margin: 0 auto; padding: 24px; }
h1 { color:#0B8C72; border-bottom:3px solid #0FAF8E; padding-bottom:8px; font-size:26px; margin-top:48px; page-break-before: always; }
h1:first-of-type { page-break-before: avoid; margin-top:0; }
h2 { color:#0B8C72; border-left:4px solid #0FAF8E; padding-left:10px; font-size:20px; margin-top:32px; }
h3 { font-size:16px; color:#111827; margin-top:24px; }
table { border-collapse:collapse; width:100%; margin:14px 0; font-size:12.5px; }
th { background:#E6F7F3; color:#0B8C72; text-align:left; }
th,td { border:1px solid #d1d5db; padding:6px 9px; vertical-align:top; }
tr:nth-child(even) td { background:#fafafa; }
code { background:#f3f4f6; padding:1px 5px; border-radius:4px; font-size:12.5px;
       font-family:"SF Mono",Menlo,Consolas,"Droid Sans Fallback",monospace; }
pre { background:#0f172a; color:#e2e8f0; padding:14px; border-radius:8px; overflow-x:auto;
      font-size:12px; line-height:1.5; }
pre code { background:none; color:inherit; padding:0; }
blockquote { border-left:4px solid #0FAF8E; background:#E6F7F3; margin:14px 0;
             padding:10px 14px; border-radius:0 8px 8px 0; color:#374151; }
blockquote p { margin:4px 0; }
a { color:#0B8C72; }
hr { border:none; border-top:1px dashed #cbd5e1; margin:28px 0; }
.cover { text-align:center; padding:120px 0 60px; page-break-after: always; }
.cover h1 { border:none; font-size:34px; page-break-before: avoid; }
.cover p { color:#6b7280; }
.toc-note { color:#6b7280; font-size:12px; }
"""

def build():
    parts = []
    for f in DOCS:
        md = (HERE / f).read_text(encoding="utf-8")
        html = markdown.markdown(md, extensions=["tables", "fenced_code", "sane_lists", "toc"])
        parts.append(f'<section data-src="{f}">{html}</section>')
    today = datetime.date.today().isoformat()
    body = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>青沐生命科技小程序 · 审查与重构设计文档</title><style>{CSS}</style></head><body>
<div class="cover"><h1>青沐生命科技微信小程序<br>代码审查与重构设计文档</h1>
<p>代码审查报告 · 重构架构设计 · 产品原型与业务建议 · 开发任务拆解</p>
<p class="toc-note">生成日期 {today} · 基于 running-group-stats 全量代码审查</p></div>
{''.join(parts)}</body></html>"""
    out_html = HERE / "review-package.html"
    out_html.write_text(body, encoding="utf-8")
    print("HTML ->", out_html)
    from weasyprint import HTML
    HTML(string=body, base_url=str(HERE)).write_pdf(HERE / "review-package.pdf")
    print("PDF  ->", HERE / "review-package.pdf")

if __name__ == "__main__":
    build()
