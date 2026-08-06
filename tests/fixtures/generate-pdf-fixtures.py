from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT_DIR = Path(__file__).resolve().parent / "pdfs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def document(path: Path, title: str):
    return SimpleDocTemplate(
        str(path),
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54,
        title=title,
        author="NeuroPath test fixtures",
    )


def build_text_pdf():
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Cellular Respiration Study Brief", styles["Title"]),
        Spacer(1, 14),
        Paragraph("Learning objective", styles["Heading2"]),
        Paragraph(
            "Explain how mitochondria convert chemical energy from glucose into ATP through glycolysis, the citric acid cycle, and oxidative phosphorylation.",
            styles["BodyText"],
        ),
        Spacer(1, 10),
        Paragraph("Required evidence", styles["Heading2"]),
        Paragraph(
            "The final response must compare aerobic and anaerobic pathways, define the role of the electron transport chain, and include one worked ATP-yield example.",
            styles["BodyText"],
        ),
    ]
    document(OUTPUT_DIR / "digital-text.pdf", "Digital text fixture").build(story)


def build_scanned_pdf():
    width, height = 1275, 1650
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    try:
        heading = ImageFont.truetype("DejaVuSans-Bold.ttf", 54)
        body = ImageFont.truetype("DejaVuSans.ttf", 34)
    except OSError:
        heading = ImageFont.load_default()
        body = ImageFont.load_default()
    draw.text((110, 120), "SCANNED FIELDWORK NOTES", fill="#241b35", font=heading)
    lines = [
        "Survey topic: mangrove biodiversity",
        "Record salinity at three sites.",
        "Count crab burrows in each quadrat.",
        "Photograph leaf adaptations.",
        "Submission: one-page comparison by Friday.",
    ]
    for index, line in enumerate(lines):
        draw.text((110, 260 + index * 92), line, fill="#222222", font=body)
    image_path = OUTPUT_DIR / "scanned-page.png"
    image.save(image_path, "PNG")

    from reportlab.pdfgen import canvas

    pdf_path = OUTPUT_DIR / "scanned-image-only.pdf"
    pdf = canvas.Canvas(str(pdf_path), pagesize=letter)
    pdf.setTitle("Scanned image-only fixture")
    pdf.drawImage(str(image_path), 0, 0, width=letter[0], height=letter[1], preserveAspectRatio=True, anchor="c")
    pdf.showPage()
    pdf.save()
    image_path.unlink()


def build_rubric_pdf():
    styles = getSampleStyleSheet()
    rows = [
        ["Criterion", "Excellent", "Developing", "Points"],
        ["Argument", "Clear thesis and sustained reasoning", "Thesis is broad or inconsistent", "30"],
        ["Evidence", "Uses 4 credible sources with analysis", "Uses fewer than 3 sources", "30"],
        ["Structure", "Logical sections and strong transitions", "Sequence is difficult to follow", "20"],
        ["Style", "Precise language and correct citations", "Frequent errors or missing citations", "20"],
    ]
    table = Table(rows, colWidths=[1.15 * inch, 2.4 * inch, 2.35 * inch, 0.55 * inch], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#5d3c91")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.75, colors.HexColor("#c9bfd8")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f7f4fb")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story = [Paragraph("Research Essay Rubric", styles["Title"]), Spacer(1, 16), table]
    document(OUTPUT_DIR / "rubric-table.pdf", "Rubric table fixture").build(story)


def build_visual_pdf():
    styles = getSampleStyleSheet()
    chart = VerticalBarChart()
    chart.x = 48
    chart.y = 45
    chart.height = 150
    chart.width = 390
    chart.data = [[42, 58, 73, 91]]
    chart.categoryAxis.categoryNames = ["Week 1", "Week 2", "Week 3", "Week 4"]
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 100
    chart.valueAxis.valueStep = 20
    chart.bars[0].fillColor = colors.HexColor("#6e48bd")
    drawing = Drawing(500, 245)
    drawing.add(String(48, 220, "Practice quiz accuracy (%)", fontName="Helvetica-Bold", fontSize=13))
    drawing.add(chart)

    flow = Drawing(500, 145)
    labels = ["Collect data", "Analyze errors", "Revise strategy"]
    positions = [20, 185, 350]
    for position, label in zip(positions, labels):
        flow.add(Rect(position, 55, 130, 48, rx=8, ry=8, fillColor=colors.HexColor("#eee8f8"), strokeColor=colors.HexColor("#6e48bd")))
        flow.add(String(position + 15, 74, label, fontName="Helvetica-Bold", fontSize=10))
    flow.add(String(153, 77, "->", fontSize=16))
    flow.add(String(318, 77, "->", fontSize=16))

    story = [
        Paragraph("Learning Progress Dashboard", styles["Title"]),
        Spacer(1, 8),
        Paragraph("The chart and process diagram are required inputs for the reflection plan.", styles["BodyText"]),
        Spacer(1, 8),
        drawing,
        Spacer(1, 10),
        flow,
    ]
    document(OUTPUT_DIR / "charts-and-diagrams.pdf", "Charts and diagrams fixture").build(story)


if __name__ == "__main__":
    build_text_pdf()
    build_scanned_pdf()
    build_rubric_pdf()
    build_visual_pdf()
