import re
import fitz
import markdown

def clean_latex(text: str) -> str:
    # First, protect fenced code blocks and inline code blocks with placeholders
    code_blocks = []
    def save_fenced(match):
        code_blocks.append(match.group(0))
        return f"__CODE_BLOCK_{len(code_blocks)-1}__"

    text = re.sub(r"```[\s\S]*?```", save_fenced, text)

    inline_codes = []
    def save_inline(match):
        inline_codes.append(match.group(0))
        return f"__INLINE_CODE_{len(inline_codes)-1}__"

    text = re.sub(r"`[^`\n]+`", save_inline, text)

    # Replace common LaTeX tokens with clean Unicode characters for crisp PDF rendering
    replacements = [
        (r'\\parallel', ' || '),
        (r'\\cdot', ' · '),
        (r'\\pmod\s*n', ' (mod n)'),
        (r'\\pmod', ' mod '),
        (r'\\in', ' ∈ '),
        (r'\\leftarrow', ' ← '),
        (r'\\stackrel\{\?\}\{=\}', ' ≟ '),
        (r'\\forall', ' ∀ '),
        (r'\\ge', ' ≥ '),
        (r'\\le', ' ≤ '),
        (r'\\neq', ' ≠ '),
        (r'\\rightarrow', ' → '),
        (r'\\quad', '   '),
        (r'\\sigma', 'σ'),
        (r'\\dots', '...'),
        (r'\\log_2', 'log₂'),
        (r'\\log', 'log'),
        (r'\\text\{([^}]+)\}', r'\1'),
    ]
    for pattern, repl in replacements:
        text = re.sub(pattern, repl, text)

    # Clean up double and single dollar signs in prose
    text = re.sub(r'\$\$([^$]+)\$\$', r'<div class="math-block"><b>\1</b></div>', text)
    text = re.sub(r'\$([^$\n]+)\$', r'<span class="math-inline">\1</span>', text)

    # Restore code blocks
    for idx, code in enumerate(inline_codes):
        text = text.replace(f"__INLINE_CODE_{idx}__", code)

    for idx, block in enumerate(code_blocks):
        text = text.replace(f"__CODE_BLOCK_{idx}__", block)

    return text

def generate_pdf():
    with open("PROJECT_DOCUMENTATION.md", "r", encoding="utf-8") as f:
        md_text = f.read()

    # Pre-clean LaTeX math syntax
    cleaned_md = clean_latex(md_text)

    # Convert Markdown to HTML
    body_html = markdown.markdown(cleaned_md, extensions=['tables', 'fenced_code', 'toc'])

    full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page {{
        margin: 36pt 40pt;
    }}
    body {{
        font-family: Helvetica, Arial, sans-serif;
        font-size: 9.5pt;
        line-height: 1.45;
        color: #1e293b;
    }}
    h1 {{
        color: #0f172a;
        font-size: 20pt;
        font-weight: bold;
        margin-top: 0;
        margin-bottom: 6pt;
        border-bottom: 2.5pt solid #2563eb;
        padding-bottom: 6pt;
        page-break-after: avoid;
    }}
    h2 {{
        color: #1e3a8a;
        font-size: 13.5pt;
        font-weight: bold;
        margin-top: 18pt;
        margin-bottom: 8pt;
        border-bottom: 1pt solid #cbd5e1;
        padding-bottom: 3pt;
        page-break-after: avoid;
    }}
    h3 {{
        color: #1d4ed8;
        font-size: 11pt;
        font-weight: bold;
        margin-top: 12pt;
        margin-bottom: 4pt;
        page-break-after: avoid;
    }}
    h4 {{
        color: #334155;
        font-size: 10pt;
        font-weight: bold;
        margin-top: 8pt;
        margin-bottom: 2pt;
        page-break-after: avoid;
    }}
    p {{
        margin-top: 0;
        margin-bottom: 6pt;
    }}
    ul, ol {{
        margin-top: 0;
        margin-bottom: 8pt;
        padding-left: 20pt;
    }}
    li {{
        margin-bottom: 3pt;
    }}
    a {{
        color: #2563eb;
        text-decoration: none;
    }}
    pre {{
        background: #0f172a;
        color: #e2e8f0;
        padding: 8pt 10pt;
        border-radius: 4pt;
        font-size: 7.5pt;
        line-height: 1.35;
        font-family: "Courier New", Courier, monospace;
        margin-top: 4pt;
        margin-bottom: 8pt;
        page-break-inside: avoid;
    }}
    code {{
        background: #f1f5f9;
        color: #0f172a;
        padding: 1.5pt 3pt;
        font-size: 8pt;
        font-family: "Courier New", Courier, monospace;
        border-radius: 2pt;
        border: 0.5pt solid #cbd5e1;
    }}
    pre code {{
        background: transparent;
        color: inherit;
        padding: 0;
        border: none;
    }}
    table {{
        width: 100%;
        border-collapse: collapse;
        margin-top: 8pt;
        margin-bottom: 10pt;
        font-size: 8pt;
        page-break-inside: avoid;
    }}
    th, td {{
        border: 0.75pt solid #cbd5e1;
        padding: 5pt 7pt;
        text-align: left;
        vertical-align: top;
    }}
    th {{
        background: #f1f5f9;
        font-weight: bold;
        color: #0f172a;
    }}
    tr:nth-child(even) td {{
        background: #f8fafc;
    }}
    .math-block {{
        background: #f8fafc;
        border-left: 3pt solid #3b82f6;
        padding: 6pt 10pt;
        margin: 6pt 0;
        font-family: "Courier New", monospace;
        font-size: 9pt;
        color: #1e3a8a;
    }}
    .math-inline {{
        font-family: "Courier New", monospace;
        font-weight: bold;
        color: #1e40af;
    }}
    blockquote {{
        border-left: 3pt solid #3b82f6;
        padding-left: 10pt;
        margin: 8pt 0;
        color: #475569;
        font-style: italic;
    }}
    hr {{
        border: 0;
        border-top: 0.75pt solid #e2e8f0;
        margin: 14pt 0;
    }}
</style>
</head>
<body>
{body_html}
</body>
</html>"""

    output_pdf = "PROJECT_DOCUMENTATION.pdf"
    story = fitz.Story(html=full_html)
    writer = fitz.DocumentWriter(output_pdf)
    
    # Standard A4 size: 595.28 x 841.89 points
    page_rect = fitz.paper_rect("a4")
    margin = 36
    content_rect = fitz.Rect(margin, margin, page_rect.width - margin, page_rect.height - margin)

    more = 1
    page_num = 0
    while more:
        page_num += 1
        device = writer.begin_page(page_rect)
        more, _ = story.place(content_rect)
        story.draw(device)
        writer.end_page()

    writer.close()
    print(f"Generated {output_pdf} successfully with {page_num} pages.")

if __name__ == "__main__":
    generate_pdf()
