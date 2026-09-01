// build_docx.js — Persian RTL "10-Phase Roadmap" generator (docx-js)
// Reuses the proven audit-phase pipeline: R1 cover (RTL-adapted), 3-section numbering,
// TOC field, table rules (PERCENTAGE widths, margins, tableHeader, cantSplit), line 312.
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  PageBreak, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  SectionType, TableOfContents, LevelFormat, TableLayoutType,
} = require("docx");
const fs = require("fs");

// ───────── Palette (navy/terracotta — same family as approved audit report) ─────────
const P = {
  bg: "16283E", titleColor: "FFFFFF", subtitleColor: "C7D0DB", metaColor: "9DA9B8",
  footerColor: "6E7A88", accent: "C0623B", primary: "1F3A5F", body: "000000",
  table: { headerBg: "1F3A5F", headerText: "FFFFFF", accentLine: "9A4E2E", innerLine: "DAD4CE", surface: "F7F4F1" },
  calloutBg: "F8F1EC", calloutBar: "C0623B", calloutTitle: "8F3F20",
};

const FA = { ascii: "Tahoma", hAnsi: "Tahoma", cs: "Tahoma" };

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ───────── Text helpers ─────────
function runsFrom(text, base = {}) {
  const parts = String(text).split(/\*\*(.+?)\*\*/g);
  const runs = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") continue;
    runs.push(new TextRun({
      text: parts[i], rightToLeft: true, font: FA,
      size: base.size || 24, sizeComplexScript: base.size || 24,
      bold: i % 2 === 1 ? true : (base.bold || false),
      boldComplexScript: i % 2 === 1 ? true : (base.bold || false),
      color: base.color || P.body,
      italics: base.italics || false,
    }));
  }
  if (runs.length === 0) runs.push(new TextRun({ text: " ", rightToLeft: true, font: FA, size: base.size || 24, sizeComplexScript: base.size || 24, color: base.color || P.body }));
  return runs;
}

function rtlP(text, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: opts.after != null ? opts.after : 140, before: opts.before || 0 },
    children: runsFrom(text, { size: opts.size || 24, color: opts.color, bold: opts.bold }),
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, bidirectional: true, keepNext: true,
    alignment: AlignmentType.START,
    spacing: { before: 400, after: 180, line: 312 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 6 } },
    children: runsFrom(text, { size: 32, bold: true, color: P.primary }),
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, bidirectional: true, keepNext: true,
    alignment: AlignmentType.START,
    spacing: { before: 280, after: 130, line: 312 },
    children: runsFrom(text, { size: 28, bold: true, color: P.primary }),
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3, bidirectional: true, keepNext: true,
    alignment: AlignmentType.START,
    spacing: { before: 220, after: 110, line: 312 },
    children: runsFrom(text, { size: 25, bold: true, color: P.primary }),
  });
}

function bulletItem(text) {
  return new Paragraph({
    bidirectional: true, bullet: { level: 0 },
    alignment: AlignmentType.START,
    spacing: { line: 312, after: 80 },
    children: runsFrom(text),
  });
}
function numItem(text, ref) {
  return new Paragraph({
    bidirectional: true, numbering: { reference: ref, level: 0 },
    alignment: AlignmentType.START,
    spacing: { line: 312, after: 90 },
    children: runsFrom(text),
  });
}

// ───────── Table builder (RTL) ─────────
function buildTable(b) {
  const els = [];
  if (b.title) {
    els.push(new Paragraph({
      bidirectional: true, keepNext: true, alignment: AlignmentType.START,
      spacing: { before: 160, after: 90, line: 312 },
      children: runsFrom(b.title, { size: 21, bold: true, color: P.primary }),
    }));
  }
  const nCols = b.headers.length;
  const widths = b.widths && b.widths.length === nCols ? b.widths : b.headers.map(() => Math.floor(100 / nCols));
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: b.headers.map((htext, i) => new TableCell({
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: P.table.headerBg },
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      borders: noBorders,
      children: [new Paragraph({
        bidirectional: true, alignment: AlignmentType.CENTER, spacing: { line: 312 },
        children: runsFrom(htext, { size: 20, bold: true, color: P.table.headerText }),
      })],
    })),
  });
  const dataRows = b.rows.map((row, ri) => new TableRow({
    cantSplit: true,
    children: row.map((cell, ci) => new TableCell({
      width: { size: widths[ci], type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? "FFFFFF" : P.table.surface },
      margins: { top: 60, bottom: 60, left: 110, right: 110 },
      borders: noBorders,
      children: [new Paragraph({
        bidirectional: true, alignment: AlignmentType.START, spacing: { line: 312 },
        children: runsFrom(cell, { size: 20 }),
      })],
    })),
  }));
  els.push(new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine },
      insideVertical: NB,
    },
    rows: [headerRow, ...dataRows],
  }));
  els.push(new Paragraph({ bidirectional: true, spacing: { after: 120, line: 240 }, children: [new TextRun({ text: " ", rightToLeft: true, font: FA, size: 12 })] }));
  return els;
}

// ───────── Callout builder ─────────
function calloutRow(b, isFirst, isLast) {
  return new TableRow({
    cantSplit: true,
    children: [new TableCell({
      width: { size: 100, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: P.calloutBg },
      margins: { top: 110, bottom: 110, left: 160, right: 160 },
      borders: {
        top: isFirst ? NB : { style: BorderStyle.SINGLE, size: 2, color: "E3D5CA" },
        bottom: isLast ? NB : { style: BorderStyle.SINGLE, size: 2, color: "E3D5CA" },
        left: { style: BorderStyle.SINGLE, size: 18, color: P.calloutBar },
        right: NB,
      },
      children: [
        new Paragraph({
          bidirectional: true, alignment: AlignmentType.START,
          spacing: { line: 312, after: 70 },
          children: runsFrom(b.title, { size: 22, bold: true, color: P.calloutTitle }),
        }),
        new Paragraph({
          bidirectional: true, alignment: AlignmentType.JUSTIFIED,
          spacing: { line: 312 },
          children: runsFrom(b.text, { size: 22 }),
        }),
      ],
    })],
  });
}
function buildCalloutsGroup(callouts) {
  const rows = callouts.map((b, i) => calloutRow(b, i === 0, i === callouts.length - 1));
  return [
    new Table({
      visuallyRightToLeft: true,
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: allNoBorders,
      rows,
    }),
    new Paragraph({ bidirectional: true, spacing: { after: 120, line: 240 }, children: [new TextRun({ text: " ", rightToLeft: true, font: FA, size: 12 })] }),
  ];
}

// ───────── Cover: R1 recipe adapted to RTL ─────────
function estimateTextWidth(text, pt) {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    const isCJK = (code >= 0x4E00 && code <= 0x9FFF);
    const isSpace = ch === " ";
    if (isCJK) w += pt * 20;
    else if (isSpace) w += pt * 6;
    else w += pt * 11;
  }
  return w;
}
function wrapPersian(title, maxWidthTwips, pt) {
  const words = title.split(" ");
  const lines = []; let cur = "";
  for (const word of words) {
    const candidate = cur ? cur + " " + word : word;
    if (estimateTextWidth(candidate, pt) <= maxWidthTwips || !cur) cur = candidate;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > 1 && lines[lines.length - 1].length <= 6) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}
function calcTitleLayoutRTL(title, maxWidthTwips, preferredPt = 38, minPt = 24) {
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    lines = wrapPersian(title, maxWidthTwips, titlePt);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = wrapPersian(title, maxWidthTwips, minPt); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}
function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 400, pageHeight = 16838 } = params;
  const SAFETY = 1200;
  const usable = pageHeight - SAFETY;
  const titleH = titleLineCount * (titlePt * 23 + 200);
  const subtitleH = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishH = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaH = metaLineCount * (10 * 23 + 100);
  const implicit = 3 * 300;
  const content = titleH + subtitleH + englishH + metaH + fixedHeight + implicit;
  const remaining = Math.max(usable - content, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(remaining * 0.45), rawBottom = Math.floor(remaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  return { topSpacing, bottomSpacing };
}

function buildCoverR1RTL(config) {
  const padL = 1150, padR = 850;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayoutRTL(config.title, availableWidth, 38, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  children.push(new Paragraph({
    bidirectional: true, alignment: AlignmentType.START,
    indent: { left: padL, right: padR }, spacing: { after: 500 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
    children: [new TextRun({ text: config.englishLabel.split("").join(" "), size: 18, color: P.accent, font: FA, characterSpacing: 40 })],
  }));
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.START,
      indent: { left: padL, right: padR },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, sizeComplexScript: titleSize, bold: true, boldComplexScript: true, rightToLeft: true, color: P.titleColor, font: FA })],
    }));
  }
  children.push(new Paragraph({
    bidirectional: true, alignment: AlignmentType.START,
    indent: { left: padL, right: padR }, spacing: { after: 700, line: 340, lineRule: "atLeast" },
    children: [new TextRun({ text: config.subtitle, size: 24, sizeComplexScript: 24, rightToLeft: true, color: P.subtitleColor, font: FA })],
  }));
  for (const line of config.metaLines) {
    children.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.START,
      indent: { left: padL + 200, right: padR }, spacing: { after: 80, line: 300 },
      border: { left: { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 } },
      children: [new TextRun({ text: line, size: 22, sizeComplexScript: 22, rightToLeft: true, color: P.metaColor, font: FA })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    bidirectional: true, alignment: AlignmentType.START,
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerRight, size: 16, rightToLeft: true, color: P.footerColor, font: FA }),
      new TextRun({ text: "                                            ", size: 16, font: FA, color: P.footerColor }),
      new TextRun({ text: config.footerLeft, size: 16, rightToLeft: true, color: P.footerColor, font: FA }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        verticalAlign: "top",
        margins: { left: 0, right: 0 },
        children,
      })],
    })],
  })];
}

// ───────── Content assembly ─────────
const content = [
  ...require("./content_1.js"),
  ...require("./content_2.js"),
  ...require("./content_3.js"),
  ...require("./content_4.js"),
  ...require("./content_5.js"),
  ...require("./content_6.js"),
];

const numRefs = new Set(content.filter(b => b.t === "nums").map(b => b.ref));
const numberingConfig = [...numRefs].map(ref => ({
  reference: ref,
  levels: [{
    level: 0, format: LevelFormat.DECIMAL, text: "%1.",
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 640, hanging: 360 } } },
  }],
}));

function blocksToChildren(blocks) {
  const els = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    switch (b.t) {
      case "h1": els.push(h1(b.text)); break;
      case "h2": els.push(h2(b.text)); break;
      case "h3": els.push(h3(b.text)); break;
      case "p": els.push(rtlP(b.text)); break;
      case "bullets": b.items.forEach(it => els.push(bulletItem(it))); els.push(new Paragraph({ bidirectional: true, spacing: { after: 60, line: 240 }, children: [new TextRun({ text: " ", rightToLeft: true, font: FA, size: 12 })] })); break;
      case "nums": b.items.forEach(it => els.push(numItem(it, b.ref))); els.push(new Paragraph({ bidirectional: true, spacing: { after: 60, line: 240 }, children: [new TextRun({ text: " ", rightToLeft: true, font: FA, size: 12 })] })); break;
      case "table": els.push(...buildTable(b)); break;
      case "callout": {
        const group = [b];
        while (i + 1 < blocks.length && blocks[i + 1].t === "callout") { i++; group.push(blocks[i]); }
        els.push(...buildCalloutsGroup(group));
        break;
      }
    }
    i++;
  }
  return els;
}

// ───────── Sections & document ─────────
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

function pageFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: FA })],
    })],
  });
}
function bodyHeader() {
  return new Header({
    children: [new Paragraph({
      bidirectional: true, alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "C9CFD8", space: 4 } },
      children: [new TextRun({ text: "نقشه راه ده فاز اصلی پلتفرم عملیاتی سازمانی ideaone — نسخه ۱٫۰", size: 17, rightToLeft: true, color: "8A93A0", font: FA })],
    })],
  });
}

const coverConfig = {
  title: "نقشه راه ده فاز اصلی پلتفرم عملیاتی سازمانی ideaone",
  subtitle: "از پایلوت سندباکس تا بهره‌برداری رسمی هلدینگ چهار شرکت کاشی و سرامیک — ۱۰۸ گام و بیش از ۳٬۱۰۰ وظیفه با گیت‌های تصمیم کمی",
  englishLabel: "TEN-PHASE MASTER ROADMAP",
  metaLines: [
    "شناسه سند: DOC-L2-RMP-001",
    "تاریخ تدوین: شهریور ۱۴۰۵ (اوت ۲۰۲۶)",
    "طبقه‌بندی: محرمانه — ویژه کمیته راهبری",
    "مبنای شناسایی: سند ۲۲ فصلی منبع + نقشه راه ۲۸۷ وظیفه‌ای + ممیزی ۳۶۰ درجه",
  ],
  footerLeft: "سند محرمانه سازمانی",
  footerRight: "نسخه ۱٫۰",
};

const tocChildren = [
  new Paragraph({
    bidirectional: true, alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 360 },
    children: [new TextRun({ text: "فهرست مطالب", bold: true, boldComplexScript: true, size: 32, sizeComplexScript: 32, rightToLeft: true, color: P.primary, font: FA })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({
    bidirectional: true, spacing: { before: 220 },
    children: [new TextRun({
      text: "یادآوری: این فهرست با کد فیلد ساخته شده است؛ پس از هر ویرایش، برای به‌روزرسانی شماره صفحات روی فهرست راست‌کلیک کرده و «Update Field» را انتخاب کنید.",
      italics: true, size: 17, sizeComplexScript: 17, rightToLeft: true, color: "888888", font: FA,
    })],
  }),
];

const doc = new Document({
  creator: "Z.ai",
  title: "نقشه راه ده فاز اصلی پلتفرم عملیاتی سازمانی ideaone",
  styles: {
    default: {
      document: {
        run: { font: FA, size: 24, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: FA, size: 32, bold: true, color: P.primary },
        paragraph: { spacing: { before: 400, after: 180, line: 312 } },
      },
      heading2: {
        run: { font: FA, size: 28, bold: true, color: P.primary },
        paragraph: { spacing: { before: 280, after: 130, line: 312 } },
      },
      heading3: {
        run: { font: FA, size: 25, bold: true, color: P.primary },
        paragraph: { spacing: { before: 220, after: 110, line: 312 } },
      },
    },
  },
  numbering: { config: numberingConfig },
  sections: [
    {
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1RTL(coverConfig),
    },
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageFooter() },
      children: tocChildren,
    },
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: bodyHeader() },
      footers: { default: pageFooter() },
      children: blocksToChildren(content),
    },
  ],
});

const OUT = process.argv[2] || "/home/z/my-project/download/نقشه راه ۱۰ فاز اصلی ideaone.docx";
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log(`DOCX written: ${OUT} (${(buf.length / 1024).toFixed(0)} KB)`);
});
