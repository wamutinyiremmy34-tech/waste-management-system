"""
PDF report generation (spec section 35). Reuses the same underlying query
logic as the CSV reports (app/api/v1/reports.py) but renders a properly
styled, branded document using reportlab's Platypus API — headers, a title
block with generation metadata, a summary line, and a real table with
alternating row shading — rather than a bare unstyled dump of rows, which
was the whole reason PDF export was deferred in earlier iterations (see
docs/reporting.md).
"""
import io
from datetime import date, datetime, timezone
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

BRAND_GREEN = colors.HexColor("#1b4332")
BRAND_LIGHT_GREEN = colors.HexColor("#2d6a4f")
ROW_ALT = colors.HexColor("#f0f7f2")

_styles = getSampleStyleSheet()

_title_style = ParagraphStyle(
    "EcoTrackTitle", parent=_styles["Title"], textColor=BRAND_GREEN, fontSize=20, spaceAfter=4
)
_subtitle_style = ParagraphStyle(
    "EcoTrackSubtitle", parent=_styles["Normal"], textColor=colors.HexColor("#57534e"), fontSize=10, spaceAfter=2
)
_summary_style = ParagraphStyle(
    "EcoTrackSummary", parent=_styles["Normal"], fontSize=11, spaceBefore=10, spaceAfter=14
)
_footer_style = ParagraphStyle(
    "EcoTrackFooter", parent=_styles["Normal"], textColor=colors.HexColor("#a8a29e"), fontSize=8
)


def _table_style(header_bg=BRAND_GREEN) -> TableStyle:
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e7e5e4")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_ALT]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]
    )


def build_report_pdf(
    title: str,
    subtitle: str,
    summary_lines: list[str],
    column_headers: list[str],
    rows: list[list[str]],
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> bytes:
    """
    Builds a real, styled PDF report and returns its bytes. Reused by every
    report endpoint — only the title/columns/rows differ per report type.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=16 * mm,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        title=title,
    )

    story = [
        Paragraph("EcoTrack", _subtitle_style),
        Paragraph(title, _title_style),
    ]

    range_text = ""
    if date_from or date_to:
        range_text = f"Period: {date_from or 'earliest'} – {date_to or 'latest'}"
    generated_text = f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
    story.append(Paragraph(" · ".join(filter(None, [subtitle, range_text, generated_text])), _subtitle_style))

    for line in summary_lines:
        story.append(Paragraph(line, _summary_style))

    if rows:
        table_data = [column_headers] + rows
        # Reasonable column widths: first column wider (usually a description/id), rest even.
        available_width = A4[0] - 32 * mm
        col_count = len(column_headers)
        col_widths = [available_width / col_count] * col_count
        table = Table(table_data, colWidths=col_widths, repeatRows=1)
        table.setStyle(_table_style())
        story.append(table)
    else:
        story.append(Paragraph("No records found for the selected period.", _styles["Normal"]))

    story.append(Spacer(1, 16))
    story.append(
        Paragraph(
            "This report reflects data recorded in EcoTrack at the time of generation. "
            "Figures are computed directly from the platform database.",
            _footer_style,
        )
    )

    doc.build(story)
    return buffer.getvalue()
