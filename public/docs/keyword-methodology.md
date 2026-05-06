# Keyword List Methodology

This document describes how the keyword lists in Document Lens were created. Understanding this methodology is important for researchers who need to cite or reproduce their analysis.

---

## Overview

Document Lens provides two types of keyword lists for each research focus:

1. **Framework-Based Keywords**: Terms derived from established standards and frameworks (e.g., TCFD, NIST CSF, PMBOK)
2. **General Domain Keywords**: Common terminology used in the field without framework-specific constraints

---

## Creation Process

### Tools Used

The keyword lists were created using a hybrid approach:

- **Large Language Model (LLM)**: Claude (Anthropic) was used to generate initial keyword lists based on framework documentation and domain knowledge
- **Human Review**: All lists were reviewed and validated against official framework documentation
- **Iterative Refinement**: Keywords were organized into logical categories aligned with framework structures

### Framework-Based Keywords

For each framework, keywords were derived from:

1. **Official Documentation**: Primary source documents from framework publishers
2. **Framework Structure**: Keywords organized to match the framework's official structure (e.g., TCFD's four pillars, NIST CSF's five functions)
3. **Implementation Guidance**: Supplementary materials and implementation guides
4. **Common Usage**: Terms frequently used by practitioners implementing the framework

---

## Source Documentation

### Sustainability Focus

| Framework | Primary Sources |
|-----------|-----------------|
| TCFD | FSB-TCFD Recommendations (2017), TCFD Knowledge Hub |
| GRI | GRI Standards 2021, Global Reporting Initiative |
| UN SDGs | UN Sustainable Development Goals (2015), UN Global Compact |
| SASB | SASB Standards, now maintained by ISSB/IFRS Foundation |

### Cybersecurity Focus

| Framework | Primary Sources |
|-----------|-----------------|
| NIST CSF | NIST Cybersecurity Framework 2.0, NIST SP 800-53 |
| ISO 27001 | ISO/IEC 27001:2022, ISO/IEC 27002:2022 |
| CIS Controls | CIS Critical Security Controls v8 |
| MITRE ATT&CK | MITRE ATT&CK Enterprise Matrix |

### Finance Focus

| Framework | Primary Sources |
|-----------|-----------------|
| Financial Ratios | CFA Institute curriculum, financial analysis textbooks |
| SEC Regulations | SEC filing requirements, FASB ASC |
| Basel III | Bank for International Settlements, Basel Committee |
| Risk Metrics | COSO ERM Framework, RiskMetrics methodology |

### Healthcare Focus

| Framework | Primary Sources |
|-----------|-----------------|
| Clinical Trials | FDA Guidance, ICH Guidelines, ClinicalTrials.gov |
| FDA Regulations | FDA Code of Federal Regulations, FDA Guidance Documents |
| HIPAA | HHS HIPAA Regulations, OCR Guidance |
| Medical Terminology | Medical dictionaries, ICD-10, CPT codes |

### Legal Focus

| Framework | Primary Sources |
|-----------|-----------------|
| Contract Terms | ABA Model Agreements, legal practice standards |
| Regulatory Language | COSO Framework, compliance standards |
| Legal Provisions | Black's Law Dictionary, legal practice guides |
| Compliance Keywords | FCPA, GDPR, employment law standards |

### Academic Focus

| Framework | Primary Sources |
|-----------|-----------------|
| Research Methods | Research methods textbooks, APA guidelines |
| Statistical Terms | Statistical methods textbooks, SPSS/R documentation |
| Literature Review | Cochrane Handbook, PRISMA guidelines |
| Citation Analysis | Web of Science, Scopus, bibliometric standards |

### Project Management Focus

| Framework | Primary Sources |
|-----------|-----------------|
| Agile/Scrum | Agile Manifesto, Scrum Guide, SAFe Framework |
| PMBOK | PMBOK Guide (PMI), 7th Edition |
| Risk Management | PMBOK Guide, ISO 31000 |
| Resource Planning | PMBOK Guide, resource management standards |

---

## General Domain Keywords

General domain keyword lists were created to provide:

- **Flexibility**: For documents that don't follow specific frameworks
- **Exploratory Analysis**: For initial document exploration before framework selection
- **Broader Coverage**: Common industry terminology beyond formal frameworks

These lists include:
- Fundamental domain concepts
- Common industry terminology
- Practitioner language
- Cross-cutting themes

---

## Keyword Selection Criteria

Keywords were selected based on:

| Criterion | Description |
|-----------|-------------|
| **Relevance** | Direct relevance to the framework or domain |
| **Frequency** | Terms commonly appearing in relevant documents |
| **Specificity** | Balance between specific technical terms and broader concepts |
| **Distinctiveness** | Terms that indicate discussion of the topic (avoiding overly common words) |

---

## Keyword Categories

Keywords are organized into logical categories that reflect:

1. **Framework Structure**: For framework-based lists, categories match official framework components
2. **Functional Areas**: For general lists, categories represent major functional domains
3. **Concept Groupings**: Related terms are grouped for easier selection

---

## Limitations

Researchers should be aware of the following limitations:

| Limitation | Description |
|------------|-------------|
| **LLM Generation** | Initial lists were generated by an LLM, which may introduce biases or gaps |
| **English Only** | Keywords are in English; translations may not capture all nuances |
| **Point in Time** | Framework terminology evolves; lists reflect standards as of creation date (January 2025) |
| **Coverage** | Lists are not exhaustive; researchers may need to add domain-specific terms |
| **Context Sensitivity** | Keywords may have different meanings in different contexts |

---

## Custom Keyword Lists

Document Lens fully supports custom keyword lists. You can:

### Create New Lists
1. Go to **Keyword Lists** page
2. Click **"New List"**
3. Enter name, description, and keywords (one per line)
4. Click **Create List**

### Import from CSV
1. Go to **Keyword Lists** page
2. Click **"Import CSV"**
3. Select your CSV file
4. Format options:
   - **Simple**: One keyword per line
   - **Categorized**: `category,keyword` format (two columns)

### Duplicate Built-in Lists
1. Select any built-in framework list
2. Click **"Duplicate"**
3. Enter a new name
4. The copy is now editable — add, remove, or modify keywords

### Export Your Keywords
- Click **"Export"** on any list to download as CSV
- Include in your research documentation for reproducibility

---

## Reproducibility

For research reproducibility, we recommend:

1. **Export Your Keywords**: Use the export function to save the exact keywords used in your analysis
2. **Document Modifications**: Note any keywords you added, removed, or modified
3. **Version Control**: Record the Document Lens version used
4. **Cite This Document**: Reference this methodology document in your research

---

## Citation

When citing Document Lens keyword lists in academic work:

```
Document Lens Desktop [Computer software]. (2025). Version X.X.
Keyword lists generated using Claude (Anthropic) with human review.
https://github.com/michaelborck-education/document-lens-desktop
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 2025 | Initial keyword lists for all 7 focuses (35 framework lists) |

---

## Contact

For questions about keyword methodology or to suggest improvements:

- **GitHub Issues**: [Report an issue](https://github.com/michaelborck-education/document-lens-desktop/issues)
- **Repository**: [Document Lens Desktop](https://github.com/michaelborck-education/document-lens-desktop)
