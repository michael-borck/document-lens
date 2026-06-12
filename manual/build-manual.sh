#!/bin/bash
#
# Build Document Lens User Manual PDF using Typst directly
#
# This script:
# 1. Renders chapter markdown from the in-app help (src/pages/Help.tsx is
#    the single source of truth — see scripts/export-help-docs.tsx)
# 2. Converts markdown to Typst using pandoc
# 3. Wraps with custom template for professional styling
# 4. Renders PDF using Typst
#
# Usage: ./manual/build-manual.sh
#
# Requirements: node + esbuild (devDependency), pandoc, typst

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$SCRIPT_DIR/build"
DOCS_SOURCE="$BUILD_DIR/chapters"
OUTPUT_DIR="$PROJECT_ROOT"

# Chapter order configuration — mirrors the in-app help groups
# (Getting started · Setup · Explore · Measure · Verify · Sharing).
CHAPTERS=(
    "getting-started.md:Getting Started"
    "project-setup.md:Project Setup"
    "explore.md:Explore"
    "measure.md:Measure"
    "verify.md:Verify"
    "sharing.md:Sharing & Export"
)

echo "Building Document Lens User Manual (Typst)..."
echo "Source: $DOCS_SOURCE (generated from src/pages/Help.tsx)"
echo "Build:  $BUILD_DIR"

# Create/clean build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Regenerate the chapter markdown from the in-app help
echo "Exporting chapters from in-app help..."
(
    cd "$PROJECT_ROOT"
    npx esbuild scripts/export-help-docs.tsx --bundle --platform=node \
        --format=cjs --jsx=automatic --alias:@=./src \
        --outfile="$BUILD_DIR/export-help.cjs" --log-level=error
    node "$BUILD_DIR/export-help.cjs"
)

# Get version from package.json
VERSION=$(grep '"version"' "$PROJECT_ROOT/package.json" | sed 's/.*"version": "\(.*\)".*/\1/')
DATE=$(date +"%B %Y")

# Create the main Typst document
cat > "$BUILD_DIR/manual.typ" << 'TYPSTHEAD'
// Document Lens User Manual
// Generated from markdown documentation

#set document(
  title: "Document Lens User Manual",
  author: "Document Lens Team",
)

#set page(
  paper: "a4",
  margin: (top: 2.5cm, bottom: 2.5cm, left: 2.5cm, right: 2.5cm),
  header: context {
    if counter(page).get().first() > 2 {
      set text(size: 9pt, fill: gray)
      [Document Lens User Manual]
      h(1fr)
      counter(page).display()
    }
  },
  footer: context {
    if counter(page).get().first() > 2 {
      set text(size: 8pt, fill: gray)
      h(1fr)
      [v__VERSION__ - __DATE__]
    }
  },
)

#set text(
  font: "Libertinus Serif",
  size: 11pt,
  lang: "en",
)

#set par(
  justify: true,
  leading: 0.65em,
)

// Heading styles
#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  v(1em)
  set text(size: 22pt, weight: "bold", fill: rgb("#1a365d"))
  it
  v(0.8em)
}

#show heading.where(level: 2): it => {
  v(1.2em)
  set text(size: 15pt, weight: "bold", fill: rgb("#2c5282"))
  it
  v(0.5em)
}

#show heading.where(level: 3): it => {
  v(0.8em)
  set text(size: 12pt, weight: "bold", fill: rgb("#2b6cb0"))
  it
  v(0.3em)
}

// Code blocks
#show raw.where(block: true): it => {
  set text(font: "DejaVu Sans Mono", size: 9pt)
  block(
    fill: rgb("#f8f9fa"),
    stroke: rgb("#dee2e6"),
    inset: 12pt,
    radius: 4pt,
    width: 100%,
    it
  )
}

// Inline code
#show raw.where(block: false): box.with(
  fill: rgb("#f8f9fa"),
  inset: (x: 4pt, y: 2pt),
  outset: (y: 2pt),
  radius: 2pt,
)

// Links
#show link: it => {
  set text(fill: rgb("#2b6cb0"))
  underline(it)
}

// Tables
#set table(
  stroke: (x, y) => if y == 0 { (bottom: 1pt + rgb("#dee2e6")) } else { (bottom: 0.5pt + rgb("#e9ecef")) },
  inset: 8pt,
  fill: (x, y) => if y == 0 { rgb("#f8f9fa") },
)

// Lists
#set list(indent: 1.2em, marker: text(fill: rgb("#2c5282"))[•])
#set enum(indent: 1.2em)

// ===================== TITLE PAGE =====================
#page(
  header: none,
  footer: none,
  margin: 0pt,
)[
  #box(
    width: 100%,
    height: 100%,
    fill: gradient.linear(rgb("#1a365d"), rgb("#2c5282"), angle: 135deg),
  )[
    #align(center + horizon)[
      #block(width: 85%)[
        #v(1cm)

        // Icon
        #box(
          fill: white,
          radius: 12pt,
          inset: 16pt,
        )[
          #text(size: 42pt)[📄]
        ]

        #v(1.5cm)

        // Title
        #text(size: 42pt, weight: "bold", fill: white, tracking: 0.5pt)[
          Document Lens
        ]

        #v(0.4cm)

        #text(size: 24pt, weight: "regular", fill: white)[
          User Manual
        ]

        #v(0.8cm)

        // Subtitle
        #text(size: 14pt, fill: rgb("#a0aec0"))[
          Batch PDF Analysis for Research & Compliance
        ]

        #v(2.5cm)

        // Divider
        #line(length: 50%, stroke: 0.5pt + rgb("#4a5568"))

        #v(2.5cm)

        // Version
        #text(size: 13pt, fill: white)[
          Version __VERSION__
        ]

        #v(0.3cm)

        #text(size: 13pt, fill: rgb("#a0aec0"))[
          __DATE__
        ]

        #v(2cm)

        #text(size: 11pt, fill: rgb("#cbd5e0"))[
          Document Lens Team
        ]
      ]
    ]
  ]
]

// ===================== TABLE OF CONTENTS =====================
#page(header: none, footer: none)[
  #v(1cm)
  #text(size: 24pt, weight: "bold", fill: rgb("#1a365d"))[Contents]
  #v(0.8cm)
  #outline(
    title: none,
    indent: 1.5em,
    depth: 2,
  )
]

// ===================== PANDOC HELPERS =====================
// These are needed for pandoc's typst output

#let horizontalrule = line(length: 100%, stroke: 0.5pt + rgb("#dee2e6"))

#let block_quote(body) = {
  block(
    fill: rgb("#f8f9fa"),
    stroke: (left: 3pt + rgb("#2c5282")),
    inset: (left: 12pt, top: 8pt, bottom: 8pt, right: 8pt),
    body
  )
}

// ===================== CONTENT =====================

TYPSTHEAD

# Replace placeholders (macOS compatible)
TMP_FILE="$BUILD_DIR/manual.typ.tmp"
sed "s/__VERSION__/$VERSION/g" "$BUILD_DIR/manual.typ" > "$TMP_FILE" && mv "$TMP_FILE" "$BUILD_DIR/manual.typ"
sed "s/__DATE__/$DATE/g" "$BUILD_DIR/manual.typ" > "$TMP_FILE" && mv "$TMP_FILE" "$BUILD_DIR/manual.typ"

# Convert each chapter from markdown to typst and append
for chapter in "${CHAPTERS[@]}"; do
    IFS=':' read -r filename title <<< "$chapter"
    source_file="$DOCS_SOURCE/$filename"

    if [[ -f "$source_file" ]]; then
        echo "  Processing: $filename"

        # Convert markdown to typst using pandoc
        pandoc "$source_file" -f markdown -t typst >> "$BUILD_DIR/manual.typ"

        # Add page break between chapters (except last)
        echo "" >> "$BUILD_DIR/manual.typ"
    else
        echo "  Warning: $filename not found, skipping"
    fi
done

# Check for new docs not in list
for doc in "$DOCS_SOURCE"/*.md; do
    if [[ -f "$doc" ]]; then
        basename_doc=$(basename "$doc")
        found=false
        for chapter in "${CHAPTERS[@]}"; do
            IFS=':' read -r filename title <<< "$chapter"
            if [[ "$filename" == "$basename_doc" ]]; then
                found=true
                break
            fi
        done
        if [[ "$found" == "false" ]]; then
            echo "  Note: $basename_doc not in CHAPTERS list - add to include"
        fi
    fi
done

echo ""
echo "Rendering PDF with Typst..."
# --root lets typst read the screenshots in $PROJECT_ROOT/docs/screenshots
# (image paths in the chapters are relative to this build dir).
cd "$BUILD_DIR"
typst compile --root "$PROJECT_ROOT" manual.typ "$OUTPUT_DIR/Document-Lens-User-Manual.pdf"

echo ""
echo "Success! PDF created:"
echo "  $OUTPUT_DIR/Document-Lens-User-Manual.pdf"
