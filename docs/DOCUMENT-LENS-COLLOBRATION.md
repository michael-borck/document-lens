# Document Lens Collaboration Guide

Share your research with colleagues using .lens bundles.

---

## Overview

Document Lens enables collaboration through portable bundle files (.lens) that package your project data for sharing. No cloud infrastructure required - just export, share, and import.

---

## Bundle Contents

A .lens bundle (ZIP file) contains:

```
project-bundle.lens
├── manifest.json              # Version, project info, what's included
├── project.json               # Project configuration
├── profiles/                  # Analysis profiles
│   └── [profile-id].json      # Keywords, domains, preferences
├── documents/                 # Document metadata
│   └── [doc-id].json          # Metadata, hash, optional: text, analysis
└── pdfs/                      # OPTIONAL - original PDF files
    └── [filename].pdf
```

---

## Export Options

When exporting, you choose what to include:

| Option | Size | Contains | Use Case |
|--------|------|----------|----------|
| **Metadata Only** | Tiny | Project config, profiles, doc metadata | Share configuration |
| **+ Analysis Results** | Small | Above + cached analysis results | Share findings |
| **+ Extracted Text** | Medium | Above + full text | Replicate analysis without PDFs |
| **+ PDF Files** | Large | Everything | Complete reproducibility |

### Recommended Export Settings

**Collaborate with colleague** (most common):
```
☑ Profiles
☑ Analysis Results
☑ Extracted Text
☐ PDF Files (save bandwidth)

File size: Typically 5-50 MB
```

**Full reproducibility** (academic/publication):
```
☑ Profiles
☑ Analysis Results
☑ Extracted Text
☑ PDF Files

File size: Can be 500 MB+
```

**Share settings only**:
```
☑ Profiles
☐ Analysis Results
☐ Extracted Text
☐ PDF Files

File size: < 1 MB
```

---

## Exporting a Project

### Step 1: Open Export Dialog
```
Project Dashboard → Export button (top right)
```

### Step 2: Select Options
- Check/uncheck what to include
- See estimated file size

### Step 3: Export
- Click **Export**
- Choose save location
- Wait for export to complete
- File saved as `project-name.lens`

---

## Importing a Bundle

### Step 1: Open Import Dialog
```
Home screen → Import Bundle
```

### Step 2: Select Bundle File
- Choose the .lens file from colleague
- Preview shows what will be imported:
  - Project name
  - Number of documents
  - Profiles included
  - Analysis results (if included)

### Step 3: Import
- Click **Import**
- Wait for import to complete
- Project now appears in your project list

### Document Matching

When importing, Document Lens uses file hashes to detect duplicates:

**Same PDF file → Same hash → regardless of machine/path**

Import flow:
1. Check: Does document hash exist in your library?
   - YES: Link to existing document (skip import)
   - NO: Continue...

2. Check: Is PDF included in bundle?
   - YES: Import PDF + metadata
   - NO: Continue...

3. Check: Is text included in bundle?
   - YES: Import as "text-only" document
   - NO: Import metadata only (limited functionality)

For "PDF not found" documents:
- Indicator shows in UI: "PDF not available locally"
- You can:
  - Manually locate/import the PDF
  - Request from bundle creator
  - Continue with text-only analysis (if text was included)

---

## Collaboration Workflows

### Workflow 1: Team Research

```
Researcher A (Lead)                    Researcher B (Team Member)
    │                                      │
    ├── Creates project                    │
    ├── Imports PDFs                       │
    ├── Sets up analysis profiles          │
    ├── Runs initial analysis              │
    │                                      │
    ├── Exports .lens bundle ─────────────→│
    │   (with text, without PDFs)          ├── Downloads bundle
    │                                      ├── Imports bundle
    │                                      ├── Views/verifies analysis
    │                                      ├── Runs additional analysis
    │                                      │
    │   ←─────────────────────────────────┼── Exports their findings
    │                                      │
    ├── Imports B's bundle                 │
    ├── Reviews B's additions              │
    └── Creates combined report            │
```

### Workflow 2: Academic Publication

```
1. Complete your analysis
2. Export bundle with:
   - All profiles (methodology)
   - All analysis results (findings)
   - Extracted text (reproducibility)
   - Optionally: PDFs (if allowed)
3. Publish bundle alongside paper
4. Other researchers can:
   - Import your bundle
   - Verify your findings
   - Extend your research
```

### Workflow 3: New Team Member Onboarding

```
1. Export project with:
   - Profiles (your methodology)
   - Analysis results (your findings so far)
   - Extracted text
2. New member imports bundle
3. They immediately have:
   - Your project structure
   - Your analysis profiles
   - Your preliminary results
4. They can start contributing immediately
```

---

## Best Practices

### Naming Conventions
- Version your bundles: `project-v1.lens`, `project-v2.lens`
- Include date: `climate-analysis-2024-01.lens`
- Be descriptive: `eu-tcfd-comparison.lens`

### Documentation
- Use clear project names
- Add detailed profile descriptions
- Fill in document metadata (company, year, region)
- Consider adding a README to the project description

### File Size Management
- Export without PDFs when possible
- PDFs often account for 80%+ of bundle size
- Recipients can import their own copies of PDFs

### Version Compatibility
- Bundle manifest includes app version
- Newer versions can import older bundles
- Older versions may not support all features of newer bundles

---

## Privacy & Security

### What's Shared
Only what you explicitly include:
- Project configuration
- Analysis profiles
- Document metadata
- (Optional) Analysis results
- (Optional) Extracted text
- (Optional) Original PDFs

### What's NOT Shared
- Your other projects
- Your settings
- Your database
- Any documents not in this project

### Local Processing
- All analysis happens on your machine
- No cloud services required
- No account needed
- No data leaves your machine unless you export it

---

## Troubleshooting

### Import Failed
**Possible causes:**
- Invalid .lens file (corrupted or wrong format)
- Disk space insufficient
- Unsupported bundle version

**Solutions:**
1. Verify file is a valid .lens file
2. Check available disk space
3. Update to latest app version

### Documents Show "PDF Not Available"
**Cause:** Bundle didn't include PDFs, and you don't have matching files locally

**Solutions:**
1. Request PDFs from bundle creator
2. Import the PDFs yourself (will match by content hash)
3. Continue with text-only analysis (if text was included)

### Analysis Results Missing
**Cause:** Bundle exported without analysis results

**Solutions:**
1. Request updated bundle with analysis results
2. Re-run analysis locally

---

## Quick Reference

### Export
```
Project Dashboard → Export → Select options → Export → Share .lens file
```

### Import
```
Home → Import Bundle → Select .lens file → Import
```

### Bundle Size Guidelines
- Metadata only: < 1 MB
- With analysis: 1-10 MB
- With text: 10-100 MB
- With PDFs: 100 MB - 1 GB+

---

*Last updated: January 2026*
