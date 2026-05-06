# Document Lens User Guide

A desktop application for batch PDF analysis using domain-specific keyword frameworks. Whether you're analyzing sustainability reports, security audits, financial filings, legal contracts, or academic papers, Document Lens provides the tools you need.

---

## Quick Start

### 1. Create a Project
- Click **"New Project"** on the home screen
- Enter project name (e.g., "2024 Annual Reports")
- **Choose a Research Focus** — this determines which keyword frameworks are available:
  - **Sustainability**: TCFD, GRI, SDGs, SASB frameworks
  - **Cybersecurity**: NIST CSF, ISO 27001, CIS Controls, MITRE ATT&CK
  - **Finance**: Financial Ratios, SEC Regulations, Basel III, Risk Metrics
  - **Healthcare**: Clinical Trials, FDA Regulations, HIPAA, Medical Terms
  - **Legal**: Contract Terms, Regulatory Language, Compliance Keywords
  - **Academic**: Research Methods, Statistical Terms, Literature Review
  - **Project Management**: Agile/Scrum, PMBOK, Risk Management
  - **General**: Start with custom keywords only
- Click **Create**

### 2. Import Documents (PDFs)
- Inside your project, click **"Import PDFs"** or drag files into the drop zone
- Alternatively, click **"Add from Library"** to use documents already in your library
- App automatically extracts text and stores metadata
- Documents appear in the project dashboard

### 3. Start Analyzing
- Click **"Keyword Search"** to find framework keywords
- Click **"Visualizations"** to see keyword frequency
- Click **"N-gram Analysis"** to find common phrases
- Use **Quick Filter** on any analysis page to focus on specific documents

---

## Core Concepts

### Document Library
**What**: A central repository of all PDFs you've imported into Document Lens.

**Why**: Documents can be reused across multiple projects without duplicating files. Import once, use everywhere.

**Key Points**:
- Access via **"Document Library"** from the home screen
- One document can belong to multiple projects
- Delete from library removes from all projects
- Remove from project keeps document in library

### Projects
**What**: Organizational containers for grouping related documents together.

**Why**: Separate different research efforts, time periods, or research domains.

**Key Points**:
- Each project has a **Research Focus** that determines available keyword frameworks
- Choose from 8 focuses: Sustainability, Cybersecurity, Finance, Healthcare, Legal, Academic, Project Management, or General

**Examples**:
- "2024 Climate Reports" (Sustainability focus)
- "Security Audit Q1" (Cybersecurity focus)
- "Contract Review 2024" (Legal focus)

### Quick Filter
**What**: Ad-hoc filtering on analysis pages to include/exclude specific documents.

**Why**: Analyze any subset of your project's documents without creating separate projects.

**Use Cases**:
- Compare just 3 specific companies
- Analyze only documents from 2023
- Focus on documents that mention certain topics

### Project Profile
**What**: Each project has one profile that stores your keyword framework selections.

**Why**: Your keyword configuration is saved and persists across sessions.

**Key Points**:
- Click **Profile** button in project header to edit
- Enable/disable frameworks and select specific keywords
- Use **Duplicate Project** to analyze the same documents with different keyword configurations

---

## Research Focuses

Research focuses let you tailor Document Lens to your specific domain. Each focus comes with pre-loaded keyword frameworks designed by experts in that field.

### Available Focuses

#### Sustainability
For ESG reporting, climate disclosures, and corporate sustainability analysis.

| Framework | Description | Keywords |
|-----------|-------------|----------|
| **TCFD** | Climate-related Financial Disclosures | Governance, Strategy, Risk Management, Metrics |
| **GRI** | Global Reporting Initiative Standards | Economic, Environmental, Social indicators |
| **SDGs** | UN Sustainable Development Goals | All 17 goals with specific indicators |
| **SASB** | Sustainability Accounting Standards | Industry-specific sustainability metrics |

#### Cybersecurity
For security audits, compliance assessments, and threat analysis.

| Framework | Description | Keywords |
|-----------|-------------|----------|
| **NIST CSF** | Cybersecurity Framework | Identify, Protect, Detect, Respond, Recover |
| **ISO 27001** | Information Security Management | Organizational, People, Physical, Technical controls |
| **CIS Controls** | Critical Security Controls | Basic, Foundational, Organizational safeguards |
| **MITRE ATT&CK** | Adversary Tactics & Techniques | Tactics, Techniques, Threat Intelligence |

#### Finance
For financial analysis, regulatory compliance, and risk assessment.

| Framework | Description | Keywords |
|-----------|-------------|----------|
| **Financial Ratios** | Key Financial Metrics | Profitability, Liquidity, Solvency, Efficiency |
| **SEC Regulations** | Securities & Exchange Commission | Filings, GAAP, Audit, Corporate Governance |
| **Basel III** | Banking Regulations | Capital Requirements, Liquidity, Risk Management |
| **Risk Metrics** | Enterprise Risk Management | Market Risk, Credit Risk, Operational Risk |

#### Healthcare
For clinical research, regulatory submissions, and healthcare compliance.

| Framework | Description | Keywords |
|-----------|-------------|----------|
| **Clinical Trials** | Research Methodology | Trial Phases, Study Design, Endpoints, Regulatory |
| **FDA Regulations** | Drug & Device Approval | Drug Approval, Manufacturing, Labeling, Inspections |
| **HIPAA** | Privacy & Security | Privacy Rule, Security Rule, Breach Notification |
| **Medical Terminology** | Healthcare Terms | Diagnostics, Treatment, Patient Care, Systems |

#### Legal
For contract analysis, regulatory review, and compliance documentation.

| Framework | Description | Keywords |
|-----------|-------------|----------|
| **Contract Terms** | Agreement Language | Core Terms, Standard Clauses, Commercial Terms, IP |
| **Regulatory Language** | Compliance Terms | Compliance Framework, Due Diligence, Reporting |
| **Legal Provisions** | Remedies & Disputes | Dispute Resolution, Liability, IP Rights, M&A |
| **Compliance Keywords** | Ethics & Governance | Ethics, Corporate Governance, Privacy, Employment |

#### Academic Research
For literature review, methodology analysis, and scholarly work.

| Framework | Description | Keywords |
|-----------|-------------|----------|
| **Research Methods** | Study Design | Research Design, Quantitative, Qualitative, Data Collection |
| **Statistical Terms** | Analysis Methods | Descriptive, Inferential, Advanced Methods, Data Quality |
| **Literature Review** | Review Process | Review Types, Search, Analysis, Academic Writing |
| **Citation Analysis** | Impact Assessment | Citation Metrics, Journal Metrics, Collaboration |

#### Project Management
For project documentation, agile practices, and governance.

| Framework | Description | Keywords |
|-----------|-------------|----------|
| **Agile/Scrum** | Agile Methodology | Principles, Scrum Framework, Artifacts, Ceremonies |
| **PMBOK** | Project Management Body of Knowledge | Process Groups, Knowledge Areas, Planning, Stakeholders |
| **Risk Management** | Project Risks | Identification, Analysis, Response, Monitoring |
| **Resource Planning** | Capacity & Budget | Resource Planning, Capacity, Team, Budget |

#### General
Start with a blank slate — no pre-loaded frameworks. Use this when:
- Your research domain isn't listed above
- You want to use only custom keyword lists
- You're exploring a new area

### Choosing a Focus

When creating a new project, you'll see the focus selector:

1. Click **New Project**
2. Enter your project name
3. Click a focus card to select it
4. Read the description to confirm it matches your needs
5. Click **Create**

### Switching Focuses

Focuses are set when you create a project. To use a different focus:
1. Create a new project with the desired focus
2. Use **Add from Library** to add your existing documents to the new project

### Using Multiple Focuses

If your research spans multiple domains (e.g., healthcare finance), you can:
1. Create separate projects for each focus
2. Add the same documents to both projects
3. Analyze with domain-specific frameworks in each

---

## Basic Workflow

### Scenario: Analyzing Corporate Climate Reports

**Step 1: Create Project**
```
Home → New Project → Name: "2024 Climate Reports"
```

**Step 2: Import Documents**
```
Project Dashboard → Import PDFs → Select 10 PDFs
Wait for extraction complete (shows progress bar)

Or: Add from Library → Select existing documents
```

**Step 3: Add Document Metadata** (optional, but recommended)
```
Click document row → Edit → Add metadata:
- Company name
- Report year
- Industry
- Country
```

**Step 4: Run Keyword Search**
```
Keyword Search → Select framework (e.g., TCFD)
→ Click keywords to search for
→ View results showing which documents contain keywords
→ Export results as CSV/Excel
```

**Step 5: Use Quick Filter for Subset Analysis**
```
Visualizations → Click "All Documents" dropdown
→ Select "Select specific documents..."
→ Check the 3 companies you want to compare
→ Apply → Analysis updates to show only those documents
```

**Step 6: View Individual Document Stats**
```
Documents tab → Click "..." menu on document row
→ "View Stats"
→ See word count, readability scores, top keywords
```

---

## Document Library

### Accessing the Library
1. From home screen, click **"Document Library"**
2. Or click **"Library"** in the sidebar

### Library Features

**View All Documents**
- See every PDF you've ever imported
- Search/filter by filename, company, year
- Sort by any column

**Add to Projects**
- Select documents → **"Add to Project"**
- Choose one or more projects
- Documents remain in library and appear in projects

**Remove vs Delete**
- **Remove from Project**: Document stays in library, removed from one project
- **Delete from Library**: Permanently removes document from everywhere

### Importing New Documents

**Method 1: Import to Project**
```
Project Dashboard → Import PDFs
Documents added to both library AND current project
```

**Method 2: Import to Library Only**
```
Document Library → Import PDFs
Documents added to library, can assign to projects later
```

### Document Metadata

Each document can have:
- **Filename**: Auto-detected from PDF
- **Company Name**: For organizing by company
- **Report Year**: For temporal analysis
- **Industry**: For sector comparisons
- **Country**: For regional analysis
- **Report Type**: (e.g., Annual Report, Sustainability Report)

---

## Quick Filter

### What Is Quick Filter?

Quick Filter lets you analyze a subset of documents without modifying your project. Available on:
- Visualizations page
- N-gram Analysis page

### Using Quick Filter

1. Navigate to **Visualizations** or **N-gram Analysis**
2. Click the **filter dropdown** (shows "All Documents" by default)
3. Select **"Select specific documents..."**
4. In the dialog, check the documents you want to include
5. Click **Apply Filter**
6. Analysis re-runs with only selected documents

### Quick Filter vs Projects

| Feature | Quick Filter | Projects |
|---------|--------------|----------|
| Scope | Temporary, per-session | Permanent organization |
| Storage | Not saved | Saved to database |
| Use case | Ad-hoc exploration | Ongoing research |
| Sharing | Not exportable | Exportable in bundles |

### When to Use Quick Filter

**Good for:**
- "Let me just check these 3 documents quickly"
- "What if I exclude the outlier company?"
- "Compare documents from a single year"

**Better as a Project:**
- Repeated analysis on same subset
- Need to share with colleagues
- Part of your research methodology

---

## Document Analysis

### Viewing Individual Document Stats

1. Go to your project's **Documents** tab
2. Find the document you want to analyze
3. Click the **"..."** menu (three dots) on that row
4. Select **"View Stats"**

### Available Metrics

**Text Statistics**
- Word count
- Sentence count
- Paragraph count
- Average sentence length

**Readability Scores**
- Flesch Reading Ease (0-100, higher = easier to read)
- Flesch-Kincaid Grade Level
- Gunning Fog Index

**Writing Quality**
- Vocabulary richness (unique words / total words)
- Passive voice ratio

**Top Words**
- Most frequently used words in the document
- Excludes common stop words

### Interpreting Readability

| Flesch Score | Difficulty | Typical Audience |
|--------------|------------|------------------|
| 90-100 | Very Easy | 5th grade |
| 80-89 | Easy | 6th grade |
| 70-79 | Fairly Easy | 7th grade |
| 60-69 | Standard | 8th-9th grade |
| 50-59 | Fairly Difficult | College |
| 30-49 | Difficult | College graduate |
| 0-29 | Very Difficult | Professional |

### Running Analysis

Documents must be analyzed before stats are available:
1. Go to project **Analysis** section
2. Click **"Run Analysis"**
3. Select analysis types (text metrics, readability, etc.)
4. Analysis runs on all documents in project
5. Stats now available via "View Stats"

---

## Project Profile

Each project has one profile that stores your keyword configuration. The profile persists across sessions and can be used in Visualizations.

### Editing Your Profile

1. Click the **Profile** button in the project header
2. Enable/disable keyword frameworks using the toggles
3. Within each framework, select specific keywords to include
4. Add custom keywords if needed
5. Changes are saved automatically

### Using Profile Keywords in Visualizations

1. Go to **Visualizations** page
2. Click **"Use Profile Keywords"** button
3. Your enabled keywords are loaded for analysis

### Duplicate Project for Different Analysis

If you want to analyze the same documents with different keyword configurations:

1. Click **"..."** menu in project header
2. Select **Duplicate Project**
3. Enter a new name
4. The new project has the same documents and a copy of the profile
5. Edit the new project's profile with different keywords

This lets you compare different analysis approaches on the same document set.

---

## Keyword Search

### Basic Search

1. Go to **Keyword Search**
2. Select keywords to search for (or use your profile's saved keywords)
3. Modify keyword selection if needed:
   - Check/uncheck keywords to include/exclude
4. Click **"Search"**

### Results

Results show:
- **Document**: Which document contained keyword
- **Matches**: How many times keyword appears
- **Context**: Brief snippet around keyword
- **Page**: Which page(s) keyword appears on

### Export Results

```
Click "Export Results"
→ Choose format:
  • CSV (Excel-compatible)
  • JSON (for programmatic use)
→ File downloads
```

### Advanced: N-gram Analysis

Find common phrases in your documents:

1. Go to **N-gram Analysis**
2. (Optional) Use Quick Filter to select specific documents
3. Choose n-gram size:
   - 2-grams: "climate risk", "carbon emissions"
   - 3-grams: "climate risk management", "net zero target"
4. Set minimum frequency
5. Click **"Analyze"**

Results show most common phrases, helping identify:
- Common talking points
- Emerging terminology
- How language differs between documents

---

## Visualizations

### Available Charts

**Keyword Frequency**
- Word cloud or bar chart showing most mentioned keywords
- Use: Quick overview of document focus

**Keywords x Documents Heatmap**
- Grid showing which keywords appear in which documents
- Use: Identify patterns across your corpus

### Using Quick Filter with Visualizations

1. Go to Visualizations page
2. Click filter dropdown → "Select specific documents..."
3. Pick which documents to include
4. Charts update to show only those documents

### Exporting Charts

Each chart has an export button:
- PNG: High-quality image
- SVG: Vector format for publications
- CSV: Raw data for further analysis

---

## Data Export

### Export Formats

#### 1. CSV / Excel
Best for: Spreadsheet analysis, data science workflows

Contains: Document-level data with keywords, metrics

#### 2. JSON
Best for: API integration, programmatic analysis

Contains: Structured data for custom tools

#### 3. .lens Bundle (ZIP)
Best for: Sharing with colleagues, reproducibility

Contents:
- Project configuration
- Profiles configuration
- Document metadata
- Analysis results
- (Optional) Extracted text
- (Optional) Original PDFs

---

## Collaboration

### Share Projects & Profiles

#### Step 1: Export Bundle
```
Project Dashboard → Export Project
→ Select options:
  ☑ Profiles: Include your analysis profiles
  ☐ Analysis Results: Include cached analysis
  ☐ Extracted Text: Include PDF text
  ☐ PDF Files: Include original PDFs (larger file)
→ Click Export → .lens file downloads
```

#### Step 2: Share File
- Email .lens file to colleague
- Upload to cloud storage
- Share via file transfer service

#### Step 3: Colleague Imports
```
Their Document Lens App
→ Home screen
→ "Import Bundle"
→ Select your .lens file
→ Preview shows what will import
→ Click "Import"
→ Project & profiles now in their app
```

### Privacy & Offline

- **No cloud required**: All processing happens locally
- **No login**: No accounts needed
- **No data sharing**: Only bundles you explicitly create
- **Complete privacy**: PDFs never leave your machine unless you explicitly include them

---

## Automatic Updates

Document Lens automatically checks for updates when you launch the app, keeping you up-to-date with new features and improvements.

### How Updates Work

1. **Check**: App checks for updates a few seconds after launch
2. **Notify**: If an update is available, a notification appears in the sidebar
3. **Download**: Click **Download** to fetch the update (continues in background)
4. **Install**: When ready, click **Restart & Install** to apply the update

### Update Notification

When an update is available, you'll see a notification in the bottom of the sidebar:

```
┌─────────────────────────────────┐
│ ↻ Update available         [x] │
│   Version 0.9.0 is ready       │
│   [Download]                   │
└─────────────────────────────────┘
```

### During Download

The notification shows download progress:

```
┌─────────────────────────────────┐
│ ↓ Downloading update...        │
│   ████████░░░░░░░░  45%        │
└─────────────────────────────────┘
```

### Ready to Install

Once downloaded, you control when to restart:

```
┌─────────────────────────────────┐
│ ✓ Update ready to install      │
│   Version 0.9.0 downloaded     │
│   [Restart & Install]          │
└─────────────────────────────────┘
```

### Update Tips

- **Your work is safe**: Save any work before clicking "Restart & Install"
- **Dismiss if busy**: Click the X to dismiss — the update stays downloaded
- **Install later**: Updates install automatically when you quit the app
- **No data loss**: Your projects, documents, and settings are preserved
- **Release notes**: Visit GitHub Releases to see what's new in each version

### Troubleshooting Updates

**Update notification doesn't appear**
- Updates only work in the installed app (not during development)
- Check your internet connection
- Try restarting the app

**Download seems stuck**
- Large updates may take time on slow connections
- Progress shows in the notification
- You can continue working while it downloads

**Update fails to install**
- Restart the app and try again
- Download the latest version manually from GitHub Releases
- Check disk space (updates need temporary space)

---

## Tips & Best Practices

### Organization
- Use meaningful project names
- Add metadata to documents (company, year) for better filtering
- Use Quick Filter for ad-hoc analysis, projects for permanent organization

### Performance
- Large projects (1000+ documents) may be slower
- Use Quick Filter to subset documents during analysis
- Disable unused domains in profiles to speed up analysis

### Quality
- Start with small dataset to test your workflow
- Verify results manually (keyword search shows context)
- Document your methodology for reproducibility

### Collaboration
- Always export with profiles included
- Use metadata (company, year, country) consistently
- Version your bundles (v1, v2) when sharing updates

---

## Troubleshooting

### Search Returns No Results
**Problem**: Keywords don't match documents

**Possible causes**:
1. Keywords not actually in documents (manually review)
2. Profile has wrong keywords selected

**Solution**:
1. View original PDF to verify content
2. Edit profile to include relevant keywords

### Slow Performance
**Problem**: Analysis taking too long

**Solution**:
1. Reduce document count with Quick Filter
2. Disable unused domains in profile
3. Run analysis in smaller batches

### Document Stats Not Available
**Problem**: "View Stats" shows no analysis

**Solution**:
1. Run analysis first: Analysis → Run Analysis
2. Wait for analysis to complete
3. Stats now available

---

## Glossary

| Term | Definition |
|------|-----------|
| **Project** | Container for organizing related documents with a specific research focus |
| **Research Focus** | Domain focus (Sustainability, Cybersecurity, Finance, etc.) that determines available frameworks |
| **Document Library** | Central repository of all imported PDFs |
| **Quick Filter** | Temporary filter to analyze subset of documents |
| **Profile** | Project's keyword configuration (enabled frameworks and keywords) |
| **Framework** | Pre-built keyword list for a research domain (e.g., TCFD, NIST CSF, PMBOK) |
| **Domain** | Subject area within a framework (e.g., Governance, Strategy, Risk, Metrics) |
| **Bundle** | .lens ZIP file for sharing projects with colleagues |
| **N-gram** | Common phrase (2-gram: "climate risk", 3-gram: "net zero target") |
| **Auto-update** | Automatic download and installation of new app versions |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + N` | New Project |
| `Cmd/Ctrl + O` | Open Project |
| `Cmd/Ctrl + E` | Export |
| `Cmd/Ctrl + /` | Open Help |

---

## Contact & Support

- **Repository**: [GitHub](https://github.com/michaelborck-education/document-lens-desktop)
- **Issues**: [Report a bug](https://github.com/michaelborck-education/document-lens-desktop/issues)
