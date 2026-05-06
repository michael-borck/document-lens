# Quick Reference Guide

Fast lookup for common tasks.

---

## Task Quick Links

### Create New Project
1. Home screen → **New Project**
2. Enter name
3. **Select a focus** (Sustainability, Cybersecurity, Finance, etc.)
4. Click **Create**
5. Start importing PDFs

### Import PDFs
1. Project Dashboard → **Import PDFs** (or drag into drop zone)
2. Select PDF files → **Open**
3. Wait for extraction (progress bar)

### Add Documents from Library
1. Project Dashboard → **Add from Library**
2. Check documents to include
3. **Add Selected**

### Use Quick Filter
1. Go to **Visualizations** or **N-gram Analysis**
2. Click filter dropdown → **Select specific documents...**
3. Check documents to include
4. **Apply Filter**
5. Analysis re-runs with filtered documents

### View Document Stats
1. Project Dashboard → **Documents** tab
2. Find document row → Click **"..."** menu
3. Select **View Stats**
4. See word count, readability, top keywords

### Edit Project Profile
1. Click **Profile** button in project header
2. Enable/disable keyword frameworks
3. Select specific keywords within each framework
4. Add custom keywords
5. Changes auto-save

### Run Keyword Search
1. **Keyword Search** page
2. Verify keywords are selected
3. **Search**
4. View results with document context
5. **Export** as CSV/JSON

### Export Project as Bundle
1. **Export** button (top right)
2. Select options:
   - Profiles: Include your analysis profiles
   - Analysis Results: Include cached analysis
   - Text: Include extracted PDF text
   - PDFs: Include original PDFs (large file)
3. **Export** → .lens file downloads

### Import Bundle from Colleague
1. **Import Bundle** button
2. Select .lens file
3. Preview shows what will import
4. **Import**
5. Project & profiles now available

### View Visualizations
1. **Visualizations** page
2. (Optional) Use Quick Filter to select documents
3. View available charts:
   - Keyword frequency (tag cloud)
   - Keywords x Documents heatmap
4. **Export** chart as PNG/SVG/CSV

### N-gram Analysis
1. **N-gram Analysis** page
2. (Optional) Use Quick Filter to select documents
3. Choose n-gram size (2, 3, 4 words)
4. Set minimum frequency threshold
5. **Analyze**
6. View most common phrases

### Duplicate Project
1. Project Dashboard → Click **"..."** menu (top right)
2. Select **Duplicate Project**
3. Enter new name
4. New project created with same documents and profile (analysis results not copied)

### Delete Document
**Remove from Project** (keeps in library):
1. Documents tab → Click **"..."** menu
2. **Remove from Project**

**Delete from Library** (removes everywhere):
1. Documents tab → Click **"..."** menu
2. **Delete from Library**
3. Confirm

---

## Research Focuses

Each project has a focus that determines available keyword frameworks:

| Focus | Frameworks | Best For |
|-------|-----------|----------|
| **Sustainability** | TCFD, GRI, SDGs, SASB | ESG reports, climate disclosures |
| **Cybersecurity** | NIST CSF, ISO 27001, CIS, MITRE | Security audits, compliance |
| **Finance** | Financial Ratios, SEC, Basel III | Annual reports, filings |
| **Healthcare** | Clinical Trials, FDA, HIPAA | Medical research, compliance |
| **Legal** | Contract Terms, Regulatory, Compliance | Contracts, legal review |
| **Academic** | Research Methods, Statistics, Literature | Papers, dissertations |
| **Project Mgmt** | Agile, PMBOK, Risk Management | Project documentation |
| **General** | None (custom only) | New domains, custom keywords |

**Tip**: Focus is set when creating a project. To change focuses, create a new project and add documents from library.

---

## Automatic Updates

### When Update Available
1. Notification appears in sidebar
2. Click **Download** to fetch update
3. Continue working while it downloads
4. Click **Restart & Install** when ready

### Update States

| State | What It Means | Action |
|-------|---------------|--------|
| "Update available" | New version ready | Click Download |
| "Downloading..." | Fetching update | Wait (shows %) |
| "Ready to install" | Downloaded, waiting | Click Restart & Install |
| No notification | You're up to date | Nothing needed |

**Tip**: Updates install automatically when you quit the app if you've downloaded but not installed.

---

## Keyboard Shortcuts

| Mac | Windows | Action |
|-----|---------|--------|
| `⌘ N` | `Ctrl N` | New Project |
| `⌘ O` | `Ctrl O` | Open Project |
| `⌘ E` | `Ctrl E` | Export |
| `⌘ ,` | `Ctrl ,` | Settings |
| `⌘ /` | `Ctrl /` | Help |

---

## Common Questions

### Q: What's the difference between Quick Filter and Projects?

**Quick Filter** = Temporary, per-session filtering
- Select specific documents for analysis
- Not saved between sessions
- Good for ad-hoc exploration

**Projects** = Permanent organization
- Documents assigned to projects
- Saved to database
- Good for ongoing research

### Q: Can a document be in multiple projects?

Yes! Documents live in the central **Document Library** and can be added to any number of projects.

### Q: What's the difference between "Remove from Project" and "Delete from Library"?

- **Remove from Project**: Document stays in library, can be added to other projects
- **Delete from Library**: Permanently deletes document from everywhere

### Q: I have 50 PDFs to import. How long will it take?

About **1-2 seconds per PDF** (extraction). So 50 PDFs = 1-2 minutes.

### Q: Can I share my project with a colleague?

Yes! **Export → Bundle** (+ options) → Share the .lens file → They **Import Bundle**

### Q: What if my PDF has scanned images (not extractable text)?

Current version only works with PDFs that have extractable text.
Workaround: Use OCR tool first to create searchable PDF.

### Q: How do profiles work?

Each project has one profile that stores your keyword selections. Use **Duplicate Project** if you want to analyze the same documents with different keyword configurations.

### Q: Can I change a project's focus after creating it?

No, focuses are set at creation. To use a different focus:
1. Create a new project with the desired focus
2. Use "Add from Library" to add your existing documents
3. Your documents are now in both projects

### Q: How do I know if an update is available?

A notification appears in the sidebar when updates are available. If you don't see one, you're running the latest version.

### Q: How large can my project be?

Tested with 1000+ documents. Performance may slow with very large projects.
Use Quick Filter to subset documents during analysis for better performance.

---

## Error Messages & Solutions

| Error | Solution |
|-------|----------|
| "No results found" | Verify keywords in profile, check Quick Filter settings, review original PDF |
| "PDF not available" | Check file path, re-import if missing |
| "Database locked" | Close other instances of app, restart |
| "Import failed" | Verify .lens file is valid, check disk space, restart app |

---

## Data Storage

### Where is my data stored?

**Local database**: `~/Library/Application Support/document-lens/document-lens.db` (Mac)

Or use Settings → Data Management → **Open Database Folder**

### What gets synced to cloud?

Nothing! All data stays on your machine.

### Can I backup my data?

Yes! Copy the database file. Or Export a .lens bundle.

### Can I migrate to another computer?

Yes! Copy the database file to new computer, or Export .lens + Import.

---

## Performance Tips

### Speed Up Large Projects

1. **Use Quick Filter**: Don't analyze all 1000 documents, filter to relevant subset
2. **Disable unused domains**: Fewer domains = faster analysis
3. **Limit keyword count**: 20 keywords searches faster than 200
4. **Clear cache**: Settings → Data Management → May help if running slow

### Reduce File Size When Exporting

1. Export without PDFs (often 80% of file size)
2. Export without extracted text (if not needed)
3. Exclude analysis results (regenerate on import)

---

## Terminology Cheat Sheet

| Term | Means | Example |
|------|-------|---------|
| Project | Organizational container with a focus | "Climate Survey 2024" |
| Focus | Research domain focus | Sustainability, Cybersecurity, Finance |
| Document Library | Central PDF repository | All your imported PDFs |
| Quick Filter | Temporary document filter | Analyze 3 of 20 documents |
| Profile | Project's keyword configuration | Enabled frameworks and keywords |
| Framework | Pre-built keyword list | TCFD, NIST CSF, PMBOK |
| Domain | Subject area within framework | Governance, Strategy, Risk |
| Bundle | .lens ZIP file | "climate-survey-v2.lens" |
| N-gram | Common phrase | "climate risk" is a 2-gram |
| Auto-update | Automatic version updates | Notification in sidebar |

---

## When to Use Each Feature

| Task | Use | Notes |
|------|-----|-------|
| Organize related documents | Projects | Permanent grouping |
| Ad-hoc analysis of subset | Quick Filter | Temporary, per-session |
| See individual document stats | View Stats | From document menu |
| Find keyword occurrences | Keyword Search | Across all project documents |
| Find common phrases | N-gram Analysis | With optional Quick Filter |
| Visualize patterns | Visualizations | With optional Quick Filter |
| Share with colleagues | Export Bundle | .lens file |

---

## Pro Tips

### Tip 1: Use Quick Filter for Exploration
Before committing to analysis methodology, use Quick Filter to explore different document subsets quickly.

### Tip 2: Document Metadata
Add company name and year to documents - makes filtering and comparison much easier.

### Tip 3: View Stats for Outliers
Use "View Stats" to identify unusual documents (very long, very short, difficult to read) that might skew analysis.

### Tip 4: Export Patterns
- **Collaborate**: Export with Text, without PDFs
- **Backup**: Export with everything
- **Share settings**: Export Profiles only

### Tip 5: Pilot Approach
Before analyzing 500 documents:
1. Use Quick Filter to test with 10 docs
2. Verify results make sense
3. Scale to full dataset

---

## Version Info

**Current Version**: Check Settings → About (or bottom of sidebar)

**Updates**: App checks automatically on launch. Look for notification in sidebar.

**Changelog**: [GitHub Releases](https://github.com/michaelborck-education/document-lens-desktop/releases)

---

*Last updated: January 2025*
