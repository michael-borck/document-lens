# Analysis Workflows & Examples

Practical walkthroughs for common research scenarios.

---

## Workflow 1: Year-over-Year Trend Analysis

### Goal
Compare sustainability reporting maturity across years: Did companies strengthen their climate commitments from 2022 → 2023 → 2024?

### Setup

**Project**: "Climate Report Trends"

**Documents**: Import all reports, add metadata:
- Company name
- Report year (2022, 2023, 2024)

**Profiles**:
- "TCFD Climate Risk" (active):
  - Keywords: climate risks, physical risks, transition risks, emissions, net zero
  - Domains: Governance, Strategy, Risk Management, Metrics

### Steps

#### 1. Import & Tag Documents
```
Project → Import PDFs → Select all reports
For each document:
  → Edit metadata → Set report_year (2022, 2023, 2024)
```

#### 2. Set Up Profile
```
Profiles → New Profile
→ Name: "TCFD Climate Risk"
→ Select TCFD keywords: climate risks, transition risks, emissions, net zero
→ Select domains: Governance, Strategy, Risk Management, Metrics
→ Make Active
```

#### 3. Keyword Search by Year
```
Keyword Search → Run on all documents
→ Export results to CSV
→ In Excel, filter by report_year column

2022: "net zero" appears in 3/15 documents (20%)
2023: 8/18 documents (44%)
2024: 16/20 documents (80%)
```

**Finding**: Net zero commitments mentioned 4x more frequently in 2024 vs 2022

#### 4. Visualize with Quick Filter
```
Visualizations page
→ Use Quick Filter → Select only 2022 documents
→ Note keyword distribution
→ Change Quick Filter to 2024 documents
→ Compare keyword distribution

Export both charts for comparison
```

#### 5. N-gram Analysis by Year
```
N-gram Analysis
→ Use Quick Filter → Select 2022 documents
→ Run analysis → Note common phrases
→ Change Quick Filter to 2024 documents
→ Compare phrase evolution
```

### Key Insights
- Reporting maturity increasing year-over-year
- Net zero commitments becoming standard
- Governance focus strengthening
- Measurable metrics improving

---

## Workflow 2: Regional Comparison (EU vs US vs Asia)

### Goal
Compare how different regional markets approach sustainability reporting.

### Setup

**Project**: "Global Sustainability Reporting"

**Documents**: Import all reports with metadata:
- Company name
- Country/Region (EU, US, APAC)

**Profiles**:
- "GRI Full" (active):
  - All GRI keywords
  - All domains

### Steps

#### 1. Import & Organize
```
Import 37 PDFs with region metadata:
→ Edit each document → Set country or add "EU", "US", "APAC" to company name
```

#### 2. Regional Analysis with Quick Filter
```
Keyword Search → Run on all documents
→ Export results

Visualizations page:
→ Quick Filter → Select only EU companies
→ Export chart
→ Quick Filter → Select only US companies
→ Export chart
→ Quick Filter → Select only APAC companies
→ Export chart
```

#### 3. Compare Results
```
EU findings:
- High emphasis on: Human rights, Supply chain governance, Environmental compliance

US findings:
- Higher emphasis on: Energy efficiency, Innovation

APAC findings:
- Mixed, some companies weak on disclosure
```

#### 4. Key Findings
- **EU**: Regulation-driven, comprehensive approach, emphasis on human rights
- **US**: Market-driven, efficiency/innovation focus, less governance detail
- **APAC**: Emerging maturity, variable disclosure, fewer net zero targets

---

## Workflow 3: Company Deep-Dive Across Years

### Goal
Understand one company's sustainability evolution: How has Nike's reporting changed?

### Setup

**Project**: "Nike Sustainability Journey"

**Documents**:
- Nike 2020 Sustainability Report
- Nike 2021 Sustainability Report
- Nike 2022 Sustainability Report
- Nike 2023 Sustainability Report

**Profile**:
- "SASB + GRI Combined":
  - Keywords: Labor practices, environmental impact, governance, supply chain, innovation
  - Domains: All

### Steps

#### 1. Import Company Reports
```
Import 4 Nike sustainability reports
Edit each → Set report_year (2020, 2021, 2022, 2023)
```

#### 2. View Individual Document Stats
```
For each document:
→ Click "..." menu → View Stats
→ Note word count, readability, top keywords

Compare evolution:
2020: 45,000 words, Grade 10 reading level
2023: 62,000 words, Grade 9 reading level
→ Reports getting longer and more accessible
```

#### 3. Keyword Trends
```
Keyword Search → Run search
→ Export results
→ Filter by document to see year-over-year changes

"Sustainable materials": 25 mentions (2020) → 120 mentions (2023)
"Carbon neutral": 5 mentions (2020) → 45 mentions (2023)
```

#### 4. Interpretation
- Nike shifted from labor focus → environmental leadership
- Increased measurement/target-setting
- "Sustainable materials" becoming core strategy
- More confident public messaging

---

## Workflow 4: Board Governance Focus (SASB)

### Goal
Analyze how well boards are addressing governance issues highlighted by SASB framework.

### Setup

**Project**: "SASB Governance Review"

**Documents**: Import reports from multiple industries with metadata:
- Industry (Financial Services, Technology, Manufacturing)

**Profile**:
- "SASB Governance" (active):
  - Keywords: Board composition, executive compensation, risk oversight, audit committee, shareholder rights
  - Domain: Governance only

### Steps

#### 1. Industry-Specific Analysis
```
Visualizations page:
→ Quick Filter → Select Financial Services companies only
→ View keyword distribution
→ Export chart

→ Quick Filter → Select Technology companies only
→ View keyword distribution
→ Export chart

Compare results
```

#### 2. Governance Keyword Search
```
Keyword Search → Run on all documents

Results show:
Financial Services:
- "Board composition" in 7/8 (87%)
- "Risk oversight" in 5/8 (62%)
- "Audit committee" in 8/8 (100%)

Technology:
- "Board diversity" mentioned 120x
- "Compensation" mentioned 80x
```

#### 3. Findings
- Financial: Emphasizes audit and risk oversight
- Tech: Emphasizes diversity and compensation
- Governance focus differs by sector as expected

---

## Workflow 5: Framework Comparison (TCFD vs GRI vs SASB)

### Goal
Compare how the same reports address different frameworks' requirements.

### Setup

**Project**: "Framework Analysis"

**Documents**: 25 company reports

**Profiles** (create 3 separate ones):
- "TCFD Focus": TCFD keywords only
- "GRI Focus": GRI keywords only
- "SASB Focus": SASB keywords only

### Steps

#### 1. Create All Three Profiles
```
Profiles → Create 3 profiles, each with single framework
Make "TCFD Focus" active initially
```

#### 2. Switch Profiles, Run Analysis
```
Profiles → Activate "TCFD Focus"
→ Keyword Search → Run → Export results

Profiles → Activate "GRI Focus"
→ Keyword Search → Run → Export results

Profiles → Activate "SASB Focus"
→ Keyword Search → Run → Export results
```

#### 3. Compare Framework Coverage
```
Analysis across all 25 companies:

TCFD Coverage:
- Climate risks: 88% of reports
- Governance: 76%
- Metrics: 64%
→ Most companies strong on climate risks, weak on metrics

GRI Coverage:
- Environmental: 92% of reports
- Social: 78%
- Economic: 45%
→ Companies stronger on E and S, neglect economic impacts

SASB Coverage:
- Governance: 95%
- Risk Management: 82%
- Strategy: 71%
→ Most address governance, fewer integrate SASB into strategy
```

#### 4. Interpretation
- **TCFD**: Companies good at identifying risks, weak on metrics/targets
- **GRI**: Environmental reporting well-developed, social less comprehensive
- **SASB**: Governance topics ubiquitous, but SASB not driving strategy

---

## Workflow 6: M&A Due Diligence

### Goal
Quickly assess sustainability/governance health of acquisition target.

### Setup

**Project**: "Acme Corp - Acquisition Due Diligence"

**Documents**: Last 3 sustainability reports from target company

**Profile**:
- "Acquisition Risk Assessment":
  - Keywords: Governance, risk management, compliance, environmental liabilities, litigation
  - Domains: Governance, Risk Management

### Steps

#### 1. Import Target's Reports
```
Import last 3 years of sustainability reports
Edit metadata → Add report_year
```

#### 2. Quick Red Flag Scan
```
Keyword Search → Run
→ Look for high frequency of: "risk", "litigation", "compliance"
→ High mentions = potential issues

Results:
- "Litigation": Found in 2/3 reports → Red flag
- "Environmental liability": Found in 1/3 reports → Potential cost
- "Governance changes": Found 3x → Instability?
```

#### 3. View Stats for Each Year
```
For each document → View Stats
→ Check sentiment trend
→ Check readability trend
→ Are reports getting more or less transparent?
```

#### 4. Due Diligence Report
```
Summary:
✓ Governance structure improving
✗ Environmental liabilities undisclosed
? Litigation history concerning

Recommendation:
- Conduct environmental site assessment
- Review litigation history
- Request full governance documentation
```

---

## Workflow 7: Materiality Assessment

### Goal
Determine which ESG issues matter most to your industry peers.

### Setup

**Project**: "Energy Sector Materiality"

**Documents**: 20 reports from energy sector

**Profiles** (create multiple):
- "Climate Materiality": Climate, emissions, energy efficiency
- "Social Materiality": Labor, community, supply chain
- "Governance Materiality": Board, exec comp, ethics
- "Business Materiality": R&D, supply chain resilience, digital

### Steps

#### 1. Keyword Frequency by Category
```
For each profile, activate and run keyword search
→ Count frequency of each keyword
→ Higher frequency = more material to peers

Results:
Climate keywords: 4,200 mentions across 20 reports (avg 210/report)
Social keywords: 1,800 mentions (avg 90/report)
Governance keywords: 2,100 mentions (avg 105/report)
Business keywords: 3,200 mentions (avg 160/report)

Interpretation:
Climate = most material, Social = least material
```

#### 2. Consensus Check
```
What % of companies address each issue?
- Climate risks: 95% of companies mention
- Community engagement: 60% of companies mention
- Board diversity: 85% of companies mention

High consensus = table stakes, must address
Low consensus = differentiator, optional
```

#### 3. Strategic Implications
```
- Allocate resources to critical materiality items
- Monitor emerging issues
- De-prioritize low-consensus items
- Communicate materiality to stakeholders
```

---

## Workflow 8: Academic Research - Comparing Disclosure Standards

### Goal
Research paper: "Do mandatory climate disclosures improve target-setting?"

Hypothesis: Companies in mandatory disclosure jurisdictions (EU-CSRD) set more ambitious climate targets than voluntary disclosure markets (US).

### Setup

**Project**: "Disclosure Standards Study"

**Documents**:
- 25 EU company reports (tagged with region=EU)
- 25 US company reports (tagged with region=US)

**Profile**:
- "Climate Target Analysis": Keywords focused on net zero, carbon reduction, renewable energy, science-based targets

### Steps

#### 1. Target-Setting Frequency
```
Keyword Search → Run on all documents
→ Export results

Use Quick Filter for EU companies:
→ 24/25 (96%) have quantified targets
→ Average 8.3 targets per company

Use Quick Filter for US companies:
→ 18/25 (72%) have quantified targets
→ Average 4.2 targets per company

Finding: Mandatory disclosure correlates with more targets
```

#### 2. N-gram Analysis by Region
```
N-gram Analysis
→ Quick Filter → EU companies
→ Common phrases: "science-based targets", "2030 reduction", "net zero 2050"

→ Quick Filter → US companies
→ Common phrases: "reduce emissions", "environmental goals", "sustainability initiatives"

EU targets more specific and science-aligned
```

#### 3. Paper Structure
```
Introduction: Research question
Methods: 50 reports, 2 regions, keyword analysis
Results: Data showing EU leads on target-setting
Discussion: Regulatory mandate drives disclosure quality
Conclusion: Policy works - mandatory disclosure improves targets

Appendix: Export .lens bundle with all data, profiles, analysis
→ Allows peer verification and extension
```

#### 4. Publish with Reproducibility
```
Export .lens bundle with:
✓ All profiles
✓ All analysis results
✓ Extracted text

Publish alongside paper
→ Other researchers can verify/extend your work
→ True reproducibility
```

---

## Key Takeaways

### When to Use Each Analysis Type

| Analysis | Best For |
|----------|----------|
| Keyword Search | Quick scans, finding specific terms |
| Quick Filter | Ad-hoc subset analysis |
| View Stats | Individual document deep-dive |
| Visualizations | Pattern recognition, presentations |
| N-gram Analysis | Language patterns, common phrases |
| Profile Switching | Multi-framework research |

### Analysis Checklist

Before starting research:
- [ ] Define research question clearly
- [ ] Import documents with consistent metadata
- [ ] Create profile(s) matching framework(s)
- [ ] Test analysis on small subset (use Quick Filter)
- [ ] Document your methodology for reproducibility
- [ ] Plan export/sharing strategy

### Collaboration Tips

When sharing .lens bundles:
- Include detailed document metadata
- Name profiles clearly ("TCFD Focus" vs "GRI Focus")
- Export with analysis results + profiles for reproducibility
- Version your bundles (v1, v2) if iterating

---

## Next Steps

1. Start with Workflow 1 (Year-over-Year) - simplest entry point
2. Move to Workflow 2 (Regional) - uses Quick Filter for comparison
3. Try Workflow 7 (Materiality) - directly useful for strategy
4. Explore others based on your research needs

Questions? Check USER-GUIDE.md or open an issue on GitHub.
