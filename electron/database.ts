import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { BACKEND_URL } from './backend-manager'

let db: Database.Database | null = null

const SCHEMA = `
-- Projects (collections of documents to analyze together)
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    focus TEXT DEFAULT 'sustainability',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Documents (PDF library - independent of projects)
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,  -- DEPRECATED: use project_documents instead
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    file_size INTEGER,
    content_type TEXT,
    -- User-entered/auto-detected metadata (all editable)
    report_year INTEGER,
    company_name TEXT,
    industry TEXT,
    country TEXT,
    report_type TEXT,
    custom_tags TEXT,                -- JSON array of tags
    custom_metadata TEXT,            -- JSON object for extra fields
    -- Extracted content (cached from API)
    extracted_text TEXT,
    extracted_pages TEXT,            -- JSON: [{page_number, text}]
    pdf_metadata TEXT,               -- JSON: {author, title, creation_date, ...}
    inferred_metadata TEXT,          -- JSON: {probable_year, probable_company, ...}
    -- Analysis status
    analysis_status TEXT DEFAULT 'pending',  -- pending, analyzing, completed, failed
    analyzed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Project-Document relationship (many-to-many: documents can belong to multiple projects)
CREATE TABLE IF NOT EXISTS project_documents (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, document_id)
);

-- Cached analysis results
CREATE TABLE IF NOT EXISTS analysis_results (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    analysis_type TEXT NOT NULL,     -- readability, writing_quality, word_analysis, etc.
    results TEXT NOT NULL,           -- JSON blob from API
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Keyword lists (user-defined and framework presets)
CREATE TABLE IF NOT EXISTS keyword_lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    framework TEXT,                  -- tcfd, sdgs, gri, sasb, custom, etc.
    focus TEXT,                      -- sustainability, cybersecurity, finance, etc.
    list_type TEXT NOT NULL,         -- simple, grouped, weighted
    keywords TEXT NOT NULL,          -- JSON structure
    is_builtin BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Keyword search results (cached)
CREATE TABLE IF NOT EXISTS keyword_results (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    keyword_list_id TEXT NOT NULL REFERENCES keyword_lists(id),
    selected_keywords TEXT,          -- JSON: keywords actually used (subset selection)
    results TEXT NOT NULL,           -- JSON: {keyword: {document_id: {count, contexts}}}
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- N-gram results (cached)
CREATE TABLE IF NOT EXISTS ngram_results (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ngram_type INTEGER NOT NULL,     -- 2 for bigrams, 3 for trigrams
    filter_terms TEXT,               -- JSON: optional filter terms used
    results TEXT NOT NULL,           -- JSON: aggregated results
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Default country list (editable)
CREATE TABLE IF NOT EXISTS countries (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT TRUE
);

-- Default industry list (editable)
CREATE TABLE IF NOT EXISTS industries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    is_default BOOLEAN DEFAULT TRUE
);

-- Virtual Collections (user-defined document groupings)
CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    filter_criteria TEXT,               -- JSON: filter used to create collection
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Collection Documents (many-to-many junction table)
CREATE TABLE IF NOT EXISTS collection_documents (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_id, document_id)
);

-- Analysis Profiles (saved research lens configurations per project)
CREATE TABLE IF NOT EXISTS analysis_profiles (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    config TEXT NOT NULL,               -- JSON: keywords, domains, analysis_types, comparison settings
    is_active BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bundle Import Tracking (for deduplication and import history)
CREATE TABLE IF NOT EXISTS bundle_imports (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_bundle_path TEXT,
    source_project_id TEXT,
    source_project_name TEXT,
    imported_document_count INTEGER DEFAULT 0,
    skipped_duplicate_count INTEGER DEFAULT 0,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(report_year);
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_name);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_analysis_document ON analysis_results(document_id);
CREATE INDEX IF NOT EXISTS idx_keyword_results_project ON keyword_results(project_id);
CREATE INDEX IF NOT EXISTS idx_collections_project ON collections(project_id);
CREATE INDEX IF NOT EXISTS idx_collection_docs_collection ON collection_documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_docs_document ON collection_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_profiles_project ON analysis_profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active ON analysis_profiles(project_id, is_active);
CREATE INDEX IF NOT EXISTS idx_bundle_imports_project ON bundle_imports(project_id);
CREATE INDEX IF NOT EXISTS idx_project_docs_project ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_docs_document ON project_documents(document_id);
`

const DEFAULT_COUNTRIES = [
  { code: 'AR', name: 'Argentina' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EG', name: 'Egypt' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NO', name: 'Norway' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RU', name: 'Russia' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'KR', name: 'South Korea' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TR', name: 'Turkey' },
  { code: 'AE', name: 'UAE' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'VN', name: 'Vietnam' }
]

const DEFAULT_INDUSTRIES = [
  { id: 'energy', name: 'Energy', category: 'Energy' },
  { id: 'materials', name: 'Materials', category: 'Materials' },
  { id: 'industrials', name: 'Industrials', category: 'Industrials' },
  { id: 'consumer_disc', name: 'Consumer Discretionary', category: 'Consumer' },
  { id: 'consumer_staples', name: 'Consumer Staples', category: 'Consumer' },
  { id: 'healthcare', name: 'Health Care', category: 'Health Care' },
  { id: 'financials', name: 'Financials', category: 'Financials' },
  { id: 'it', name: 'Information Technology', category: 'Technology' },
  { id: 'communication', name: 'Communication Services', category: 'Technology' },
  { id: 'utilities', name: 'Utilities', category: 'Utilities' },
  { id: 'real_estate', name: 'Real Estate', category: 'Real Estate' },
  { id: 'mining', name: 'Mining', category: 'Materials' },
  { id: 'oil_gas', name: 'Oil & Gas', category: 'Energy' },
  { id: 'automotive', name: 'Automotive', category: 'Industrials' },
  { id: 'aerospace', name: 'Aerospace & Defense', category: 'Industrials' },
  { id: 'banking', name: 'Banking', category: 'Financials' },
  { id: 'insurance', name: 'Insurance', category: 'Financials' },
  { id: 'retail', name: 'Retail', category: 'Consumer' },
  { id: 'transportation', name: 'Transportation', category: 'Industrials' },
  { id: 'agriculture', name: 'Agriculture', category: 'Consumer' }
]

// Framework keyword data embedded directly (from src/data/frameworks/*.json)
interface FrameworkData {
  id: string
  name: string
  description: string
  focus: string
  list_type: string
  keywords: Record<string, unknown>
}

const FRAMEWORK_KEYWORDS: FrameworkData[] = [
  // ============================================
  // SUSTAINABILITY FOCUS
  // ============================================
  {
    id: 'tcfd',
    name: 'TCFD - Climate-related Financial Disclosures',
    description: "Keywords aligned with TCFD's four pillars for climate-related financial risk disclosure.",
    focus: 'sustainability',
    list_type: 'grouped',
    keywords: {
      "Governance": ["board oversight", "climate governance", "management role", "climate committee", "board responsibility", "governance structure", "executive compensation", "climate expertise", "board composition", "climate oversight", "management accountability", "climate leadership", "sustainability committee", "risk committee", "board-level review", "management processes"],
      "Strategy": ["climate risks", "physical risks", "transition risks", "climate opportunities", "scenario analysis", "2 degree pathway", "1.5 degree", "net zero", "climate strategy", "decarbonization", "low carbon", "climate resilience", "stranded assets", "carbon transition", "business model resilience", "climate scenarios", "strategic planning", "long-term risks", "medium-term risks", "short-term risks", "climate-related opportunities", "resource efficiency", "energy source", "new products", "new markets", "acute risks", "chronic risks", "policy risks", "legal risks", "technology risks", "market risks", "reputation risks"],
      "Risk Management": ["risk identification", "risk assessment", "climate risk integration", "materiality", "risk mitigation", "climate risk management", "enterprise risk", "risk processes", "risk framework", "climate risk exposure", "risk monitoring", "due diligence", "supply chain risk", "operational risk", "financial planning risk", "risk appetite"],
      "Metrics and Targets": ["scope 1", "scope 2", "scope 3", "ghg emissions", "greenhouse gas", "carbon intensity", "emission targets", "carbon neutral", "carbon footprint", "science based targets", "emission reduction", "carbon offset", "climate metrics", "energy consumption", "renewable energy percentage", "water usage", "waste metrics", "carbon pricing", "internal carbon price", "emissions intensity", "absolute emissions", "target baseline", "progress against targets"]
    }
  },
  {
    id: 'sdgs',
    name: 'UN Sustainable Development Goals',
    description: 'Keywords for the 17 UN Sustainable Development Goals adopted in 2015.',
    focus: 'sustainability',
    list_type: 'grouped',
    keywords: {
      "SDG 1 - No Poverty": ["poverty", "poverty eradication", "extreme poverty", "poverty line", "social protection", "economic resources", "basic services", "financial inclusion", "microfinance", "vulnerable", "income equality", "wealth distribution", "quality of life", "developing countries", "disadvantaged", "poor and vulnerable", "resources", "social protection systems"],
      "SDG 2 - Zero Hunger": ["hunger", "food security", "malnutrition", "sustainable agriculture", "agricultural productivity", "food production", "crop diversity", "genetic diversity", "resilient agriculture", "small-scale food producers", "rural infrastructure", "food gap", "food reserves", "nutrition", "nutritious", "undernourished", "stunting", "wasting", "trade restrictions"],
      "SDG 3 - Good Health and Well-being": ["health", "wellbeing", "well-being", "mortality", "life expectancy", "universal health coverage", "mental health", "occupational health", "workplace safety", "disease prevention", "health services", "employee health", "maternal mortality", "child mortality", "neonatal mortality", "communicable diseases", "non-communicable diseases", "road traffic accidents", "substance abuse", "reproductive health", "vaccines", "health workforce", "air pollution health", "water contamination"],
      "SDG 4 - Quality Education": ["education", "training", "skills development", "lifelong learning", "vocational training", "literacy", "equal education", "inclusive education", "scholarships", "teacher training", "workforce development", "early childhood development", "primary education", "secondary education", "technical education", "numeracy", "gender equality education", "education for sustainable development", "school enrollment"],
      "SDG 5 - Gender Equality": ["gender equality", "women empowerment", "empower women", "equal opportunities", "discrimination", "women in leadership", "gender parity", "equal pay", "workplace equality", "diversity", "inclusion", "women's rights", "female representation", "violence against women", "gender-based violence", "female genital mutilation", "forced marriage", "unpaid care work", "reproductive rights", "sexual harassment", "women in management"],
      "SDG 6 - Clean Water and Sanitation": ["clean water", "water access", "sanitation", "water quality", "water efficiency", "wastewater", "water treatment", "water scarcity", "water management", "water stewardship", "water recycling", "freshwater", "water conservation", "drinking water", "hygiene", "open defecation", "water-related ecosystems", "water harvesting", "transboundary water", "water pollution", "aquifer", "groundwater"],
      "SDG 7 - Affordable and Clean Energy": ["renewable energy", "clean energy", "energy efficiency", "solar energy", "solar power", "wind energy", "wind power", "sustainable energy", "energy access", "modern energy", "green energy", "low carbon energy", "energy transition", "fossil fuel", "hydroelectric", "hydropower", "geothermal", "biofuel", "bioenergy", "energy infrastructure", "clean fuel", "energy research", "battery storage", "energy intensity", "electricity access"],
      "SDG 8 - Decent Work and Economic Growth": ["economic growth", "decent work", "employment", "job creation", "labor rights", "labour rights", "safe work", "productive employment", "youth employment", "forced labor", "forced labour", "child labor", "child labour", "modern slavery", "living wage", "fair wages", "working conditions", "sustainable economic growth", "gdp growth", "economic productivity", "resource efficiency", "full employment", "equal pay for equal work", "migrant workers", "workers rights", "unemployment"],
      "SDG 9 - Industry Innovation and Infrastructure": ["innovation", "infrastructure", "industrialization", "sustainable infrastructure", "research and development", "r&d", "technology", "manufacturing", "resilient infrastructure", "industrial processes", "clean technologies", "digitalization", "internet access", "broadband", "information technology", "small-scale industries", "value addition", "industrial diversification", "technology transfer", "scientific research"],
      "SDG 10 - Reduced Inequalities": ["inequality", "inequalities", "equal opportunity", "social inclusion", "discrimination", "income inequality", "social protection", "migration", "migrants", "inclusion", "accessibility", "marginalized groups", "vulnerable populations", "fiscal policy", "wage policy", "developing countries representation", "remittances", "safe migration", "orderly migration", "income growth", "reduce disparities"],
      "SDG 11 - Sustainable Cities and Communities": ["sustainable cities", "urban development", "affordable housing", "public transport", "public transportation", "urban planning", "resilient cities", "air quality", "green spaces", "public spaces", "waste management", "sustainable urbanization", "smart cities", "cultural heritage", "natural heritage", "disaster resilience", "slums", "informal settlements", "urban sprawl", "sustainable buildings", "green buildings", "urban air pollution", "municipal waste"],
      "SDG 12 - Responsible Consumption and Production": ["sustainable consumption", "sustainable production", "resource efficiency", "circular economy", "waste reduction", "recycling", "sustainable sourcing", "product lifecycle", "sustainable procurement", "food waste", "food loss", "chemical management", "sustainable packaging", "eco-design", "extended producer responsibility", "sustainable practices", "sustainability reporting", "sustainable tourism", "fossil fuel subsidies", "material footprint", "domestic material consumption", "hazardous chemicals", "waste generation", "reuse", "reduce"],
      "SDG 13 - Climate Action": ["climate change", "climate action", "carbon emissions", "greenhouse gas", "ghg", "global warming", "climate adaptation", "climate mitigation", "climate resilience", "carbon reduction", "emission reduction", "paris agreement", "climate risk", "extreme weather", "sea level rise", "decarbonization", "net zero", "carbon neutral", "climate strategy", "climate finance", "climate education", "climate policy", "nationally determined contributions", "ndc", "climate hazards", "climate disasters", "low-carbon", "climate-related", "temperature rise", "cop", "unfccc"],
      "SDG 14 - Life Below Water": ["ocean", "oceans", "marine", "marine conservation", "ocean acidification", "sustainable fisheries", "marine pollution", "coral reef", "coral bleaching", "coastal ecosystems", "marine biodiversity", "overfishing", "illegal fishing", "plastic pollution", "ocean health", "marine resources", "fish stocks", "aquaculture", "marine protected areas", "blue economy", "ocean governance", "marine debris", "sea"],
      "SDG 15 - Life on Land": ["biodiversity", "deforestation", "forest", "forests", "land degradation", "ecosystem", "ecosystems", "conservation", "habitat", "habitats", "endangered species", "reforestation", "afforestation", "sustainable forestry", "sustainable forest management", "land use", "soil degradation", "protected areas", "wildlife", "invasive species", "desertification", "drought", "terrestrial ecosystems", "mountain ecosystems", "wetlands", "biodiversity loss", "poaching", "wildlife trafficking", "genetic resources", "species extinction"],
      "SDG 16 - Peace Justice and Strong Institutions": ["governance", "transparency", "accountability", "anti-corruption", "corruption", "bribery", "rule of law", "human rights", "ethical business", "whistleblower", "compliance", "fair business practices", "justice", "inclusive institutions", "effective institutions", "accountable institutions", "violence reduction", "abuse", "exploitation", "trafficking", "organized crime", "illicit financial flows", "arms trafficking", "torture", "access to justice", "legal identity", "fundamental freedoms", "public access to information"],
      "SDG 17 - Partnerships for the Goals": ["partnership", "partnerships", "collaboration", "stakeholder engagement", "public-private partnership", "multi-stakeholder", "knowledge sharing", "capacity building", "technology transfer", "international cooperation", "development assistance", "oda", "foreign direct investment", "fdi", "debt sustainability", "trade", "global partnership", "south-south cooperation", "north-south cooperation", "policy coherence", "data monitoring", "statistical capacity"]
    }
  },
  {
    id: 'gri',
    name: 'GRI - Global Reporting Initiative Standards',
    description: "Keywords aligned with GRI Economic (200), Environmental (300), and Social (400) Standards.",
    focus: 'sustainability',
    list_type: 'grouped',
    keywords: {
      "Economic (GRI 200)": ["economic performance", "economic value generated", "economic value distributed", "revenue", "operating costs", "employee wages", "employee benefits", "payments to providers of capital", "payments to government", "community investments", "market presence", "local hiring", "senior management local", "minimum wage", "indirect economic impacts", "infrastructure investments", "services supported", "significant indirect impacts", "procurement practices", "local suppliers", "spending on local suppliers", "anti-corruption", "corruption risk assessment", "corruption training", "confirmed corruption incidents", "anti-competitive behavior", "legal actions anti-competitive", "anti-trust", "monopoly practices", "tax", "tax payments by country", "tax governance"],
      "Environmental (GRI 300)": ["materials", "materials used", "raw materials", "recycled input materials", "reclaimed products", "energy", "energy consumption", "energy intensity", "energy reduction", "renewable energy", "water", "water withdrawal", "water discharge", "water consumption", "water stress areas", "water recycled", "water reused", "biodiversity", "operational sites biodiversity", "protected areas", "significant biodiversity impacts", "habitats protected", "habitats restored", "iucn red list", "conservation list species", "emissions", "direct ghg emissions", "scope 1 emissions", "indirect ghg emissions", "scope 2 emissions", "other indirect emissions", "scope 3 emissions", "ghg emissions intensity", "ghg reduction", "ozone-depleting substances", "nitrogen oxides", "nox", "sulfur oxides", "sox", "particulate matter", "air emissions", "waste", "waste generated", "waste by type", "hazardous waste", "non-hazardous waste", "waste diverted", "waste recycled", "waste composted", "waste disposed", "waste to landfill", "waste incinerated", "effluents", "water discharge quality", "spills", "significant spills", "environmental compliance", "environmental fines", "environmental sanctions", "supplier environmental assessment", "new suppliers environmental criteria"],
      "Social (GRI 400)": ["employment", "new employee hires", "employee turnover", "benefits", "full-time employees", "part-time employees", "temporary employees", "parental leave", "return to work", "labor management relations", "collective bargaining", "collective agreements", "minimum notice period", "occupational health and safety", "occupational health management", "hazard identification", "risk assessment", "worker training health", "occupational health services", "worker health promotion", "work-related injuries", "work-related ill health", "work-related fatalities", "recordable injuries", "lost time injuries", "training and education", "training hours", "employee training", "skills management", "career development", "performance reviews", "diversity and equal opportunity", "diversity of governance bodies", "diversity of employees", "gender diversity", "age diversity", "minority groups", "equal remuneration", "pay equity", "gender pay gap", "non-discrimination", "discrimination incidents", "freedom of association", "collective bargaining rights", "child labor", "child labor risk", "young workers", "forced or compulsory labor", "forced labor risk", "security practices", "security personnel trained", "human rights", "human rights training", "human rights assessment", "human rights screening", "rights of indigenous peoples", "indigenous rights", "free prior informed consent", "local communities", "community engagement", "community impact assessment", "local community programs", "supplier social assessment", "new suppliers social criteria", "negative social impacts supply chain", "public policy", "political contributions", "lobbying", "customer health and safety", "product health safety assessment", "product safety incidents", "marketing and labeling", "product information", "marketing communications", "customer privacy", "customer data breaches", "data protection", "socioeconomic compliance", "non-compliance fines"]
    }
  },
  {
    id: 'sasb',
    name: 'SASB - Sustainability Accounting Standards',
    description: "Keywords across SASB's five sustainability dimensions, now maintained by the ISSB.",
    focus: 'sustainability',
    list_type: 'grouped',
    keywords: {
      "Environment": ["ghg emissions", "greenhouse gas emissions", "scope 1 emissions", "scope 2 emissions", "scope 3 emissions", "carbon emissions", "air quality", "air emissions", "air pollutants", "criteria pollutants", "energy management", "energy consumption", "energy efficiency", "grid electricity", "renewable energy", "water management", "water withdrawal", "water consumption", "water discharge", "water stress", "water recycling", "waste management", "hazardous waste", "non-hazardous waste", "waste disposal", "waste diversion", "ecological impacts", "biodiversity impacts", "land use", "habitat", "environmental incidents", "spills", "releases", "remediation", "environmental compliance"],
      "Social Capital": ["human rights", "human rights policy", "community relations", "community engagement", "community investment", "access and affordability", "product access", "customer welfare", "customer satisfaction", "customer privacy", "data security", "data breach", "cybersecurity", "personal data", "fair marketing", "responsible marketing", "product labeling", "fair disclosure", "selling practices", "responsible lending", "financial inclusion", "financial literacy"],
      "Human Capital": ["labor practices", "fair labor", "employee health", "employee safety", "workplace safety", "occupational health", "employee engagement", "employee satisfaction", "diversity and inclusion", "workforce diversity", "gender diversity", "ethnic diversity", "equal opportunity", "employee development", "training", "talent management", "talent retention", "compensation and benefits", "fair compensation", "benefits", "collective bargaining", "labor relations", "union relations", "labor disputes", "workforce management"],
      "Business Model and Innovation": ["product lifecycle", "lifecycle management", "lifecycle assessment", "product design", "design for environment", "packaging lifecycle", "sustainable packaging", "product end-of-life", "materials sourcing", "raw materials", "sustainable materials", "supply chain management", "supply chain standards", "supplier code of conduct", "responsible sourcing", "conflict minerals", "physical supply chain", "supply chain resilience", "business model resilience", "climate adaptation", "resource scarcity", "critical materials", "materials efficiency", "product innovation", "sustainable innovation"],
      "Leadership and Governance": ["business ethics", "ethical conduct", "code of conduct", "competitive behavior", "anti-competitive practices", "antitrust", "regulatory compliance", "legal compliance", "regulatory capture", "critical incident", "crisis management", "risk management", "enterprise risk", "systemic risk management", "governance", "corporate governance", "board oversight", "board independence", "executive compensation", "incentive alignment", "lobbying", "political contributions", "political spending", "corruption", "bribery", "anti-corruption", "management of legal environment", "policy influence"]
    }
  },
  {
    id: 'sdgs-wedding-cake',
    name: 'SDGs Wedding Cake Model',
    description: 'The UN Sustainable Development Goals organized by the Stockholm Resilience Centre\'s Wedding Cake model, grouping goals into Environmental (Biosphere), Social (Society), Economic (Economy), and Governance pillars.',
    focus: 'sustainability',
    list_type: 'hierarchical',
    keywords: {
      tiers: ["Pillar", "Goal"],
      tree: {
        "Environmental": {
          "SDG 6 - Clean Water and Sanitation": ["clean water", "water access", "sanitation", "water quality", "water efficiency", "wastewater", "water treatment", "water scarcity", "water management", "water stewardship", "water recycling", "freshwater", "water conservation", "drinking water", "hygiene", "open defecation", "water-related ecosystems", "water harvesting", "transboundary water", "water pollution", "aquifer", "groundwater"],
          "SDG 13 - Climate Action": ["climate change", "climate action", "carbon emissions", "greenhouse gas", "ghg", "global warming", "climate adaptation", "climate mitigation", "climate resilience", "carbon reduction", "emission reduction", "paris agreement", "climate risk", "extreme weather", "sea level rise", "decarbonization", "net zero", "carbon neutral", "climate strategy", "climate finance", "climate education", "climate policy", "nationally determined contributions", "ndc", "climate hazards", "climate disasters", "low-carbon", "climate-related", "temperature rise", "cop", "unfccc"],
          "SDG 14 - Life Below Water": ["ocean", "oceans", "marine", "marine conservation", "ocean acidification", "sustainable fisheries", "marine pollution", "coral reef", "coral bleaching", "coastal ecosystems", "marine biodiversity", "overfishing", "illegal fishing", "plastic pollution", "ocean health", "marine resources", "fish stocks", "aquaculture", "marine protected areas", "blue economy", "ocean governance", "marine debris", "sea"],
          "SDG 15 - Life on Land": ["biodiversity", "deforestation", "forest", "forests", "land degradation", "ecosystem", "ecosystems", "conservation", "habitat", "habitats", "endangered species", "reforestation", "afforestation", "sustainable forestry", "sustainable forest management", "land use", "soil degradation", "protected areas", "wildlife", "invasive species", "desertification", "drought", "terrestrial ecosystems", "mountain ecosystems", "wetlands", "biodiversity loss", "poaching", "wildlife trafficking", "genetic resources", "species extinction"]
        },
        "Social": {
          "SDG 1 - No Poverty": ["poverty", "poverty eradication", "extreme poverty", "poverty line", "social protection", "economic resources", "basic services", "financial inclusion", "microfinance", "vulnerable", "income equality", "wealth distribution", "quality of life", "developing countries", "disadvantaged", "poor and vulnerable", "resources", "social protection systems"],
          "SDG 2 - Zero Hunger": ["hunger", "food security", "malnutrition", "sustainable agriculture", "agricultural productivity", "food production", "crop diversity", "genetic diversity", "resilient agriculture", "small-scale food producers", "rural infrastructure", "food gap", "food reserves", "nutrition", "nutritious", "undernourished", "stunting", "wasting", "trade restrictions"],
          "SDG 3 - Good Health and Well-being": ["health", "wellbeing", "well-being", "mortality", "life expectancy", "universal health coverage", "mental health", "occupational health", "workplace safety", "disease prevention", "health services", "employee health", "maternal mortality", "child mortality", "neonatal mortality", "communicable diseases", "non-communicable diseases", "road traffic accidents", "substance abuse", "reproductive health", "vaccines", "health workforce", "air pollution health", "water contamination"],
          "SDG 4 - Quality Education": ["education", "training", "skills development", "lifelong learning", "vocational training", "literacy", "equal education", "inclusive education", "scholarships", "teacher training", "workforce development", "early childhood development", "primary education", "secondary education", "technical education", "numeracy", "gender equality education", "education for sustainable development", "school enrollment"],
          "SDG 5 - Gender Equality": ["gender equality", "women empowerment", "empower women", "equal opportunities", "discrimination", "women in leadership", "gender parity", "equal pay", "workplace equality", "diversity", "inclusion", "women's rights", "female representation", "violence against women", "gender-based violence", "female genital mutilation", "forced marriage", "unpaid care work", "reproductive rights", "sexual harassment", "women in management"],
          "SDG 7 - Affordable and Clean Energy": ["renewable energy", "clean energy", "energy efficiency", "solar energy", "solar power", "wind energy", "wind power", "sustainable energy", "energy access", "modern energy", "green energy", "low carbon energy", "energy transition", "fossil fuel", "hydroelectric", "hydropower", "geothermal", "biofuel", "bioenergy", "energy infrastructure", "clean fuel", "energy research", "battery storage", "energy intensity", "electricity access"],
          "SDG 11 - Sustainable Cities and Communities": ["sustainable cities", "urban development", "affordable housing", "public transport", "public transportation", "urban planning", "resilient cities", "air quality", "green spaces", "public spaces", "waste management", "sustainable urbanization", "smart cities", "cultural heritage", "natural heritage", "disaster resilience", "slums", "informal settlements", "urban sprawl", "sustainable buildings", "green buildings", "urban air pollution", "municipal waste"],
          "SDG 16 - Peace Justice and Strong Institutions": ["governance", "transparency", "accountability", "anti-corruption", "corruption", "bribery", "rule of law", "human rights", "ethical business", "whistleblower", "compliance", "fair business practices", "justice", "inclusive institutions", "effective institutions", "accountable institutions", "violence reduction", "abuse", "exploitation", "trafficking", "organized crime", "illicit financial flows", "arms trafficking", "torture", "access to justice", "legal identity", "fundamental freedoms", "public access to information"]
        },
        "Economic": {
          "SDG 8 - Decent Work and Economic Growth": ["economic growth", "decent work", "employment", "job creation", "labor rights", "labour rights", "safe work", "productive employment", "youth employment", "forced labor", "forced labour", "child labor", "child labour", "modern slavery", "living wage", "fair wages", "working conditions", "sustainable economic growth", "gdp growth", "economic productivity", "resource efficiency", "full employment", "equal pay for equal work", "migrant workers", "workers rights", "unemployment"],
          "SDG 9 - Industry Innovation and Infrastructure": ["innovation", "infrastructure", "industrialization", "sustainable infrastructure", "research and development", "r&d", "technology", "manufacturing", "resilient infrastructure", "industrial processes", "clean technologies", "digitalization", "internet access", "broadband", "information technology", "small-scale industries", "value addition", "industrial diversification", "technology transfer", "scientific research"],
          "SDG 10 - Reduced Inequalities": ["inequality", "inequalities", "equal opportunity", "social inclusion", "discrimination", "income inequality", "social protection", "migration", "migrants", "inclusion", "accessibility", "marginalized groups", "vulnerable populations", "fiscal policy", "wage policy", "developing countries representation", "remittances", "safe migration", "orderly migration", "income growth", "reduce disparities"],
          "SDG 12 - Responsible Consumption and Production": ["sustainable consumption", "sustainable production", "resource efficiency", "circular economy", "waste reduction", "recycling", "sustainable sourcing", "product lifecycle", "sustainable procurement", "food waste", "food loss", "chemical management", "sustainable packaging", "eco-design", "extended producer responsibility", "sustainable practices", "sustainability reporting", "sustainable tourism", "fossil fuel subsidies", "material footprint", "domestic material consumption", "hazardous chemicals", "waste generation", "reuse", "reduce"]
        },
        "Governance": {
          "SDG 17 - Partnerships for the Goals": ["partnership", "partnerships", "collaboration", "stakeholder engagement", "public-private partnership", "multi-stakeholder", "knowledge sharing", "capacity building", "technology transfer", "international cooperation", "development assistance", "oda", "foreign direct investment", "fdi", "debt sustainability", "trade", "global partnership", "south-south cooperation", "north-south cooperation", "policy coherence", "data monitoring", "statistical capacity"]
        }
      }
    }
  },
  {
    id: 'sdgs-wedding-cake-counter',
    name: 'SDGs Wedding Cake - Counter-Indicators',
    description: 'Counter-indicator keywords that suggest non-alignment with SDGs. These terms may indicate prioritisation of commercial or institutional goals over sustainability commitments. Designed for use alongside the SDGs Wedding Cake Model.',
    focus: 'sustainability',
    list_type: 'hierarchical',
    keywords: {
      tiers: ["Pillar", "Goal"],
      tree: {
        "Environmental": {
          "SDG 6 - Clean Water and Sanitation": ["water extraction", "infrastructure cost recovery", "water commodification"],
          "SDG 13 - Climate Action": ["carbon offset reliance", "climate neutrality by outsourcing", "emissions trading"],
          "SDG 14 - Life Below Water": ["marine resource exploitation", "coastal development", "blue economy"],
          "SDG 15 - Life on Land": ["land acquisition", "biodiversity offsetting", "forestry partnerships"]
        },
        "Social": {
          "SDG 1 - No Poverty": ["revenue maximisation", "fee-paying priority", "market segmentation", "premium service tiers", "competitive advantage"],
          "SDG 2 - Zero Hunger": ["commercial agriculture", "export-oriented food research", "agribusiness partnerships"],
          "SDG 3 - Good Health and Well-being": ["health commercialisation", "private health partnerships", "cost containment in health services", "health outsourcing"],
          "SDG 4 - Quality Education": ["elite education", "prestige rankings", "competitive admissions", "international student revenue", "brand positioning"],
          "SDG 5 - Gender Equality": ["gender-neutral policy", "merit-only hiring", "gender-blind reporting"],
          "SDG 7 - Affordable and Clean Energy": ["fossil fuel partnerships", "energy cost efficiency", "non-renewable energy investment"],
          "SDG 11 - Sustainable Cities and Communities": ["urban expansion", "real estate development", "campus footprint growth", "infrastructure densification"],
          "SDG 16 - Peace, Justice and Strong Institutions": ["risk management", "governance efficiency", "strategic silence on human rights"]
        },
        "Economic": {
          "SDG 8 - Decent Work and Economic Growth": ["casualisation of workforce", "outsourcing", "productivity maximisation", "cost-cutting measures", "short-term contracts"],
          "SDG 9 - Industry, Innovation and Infrastructure": ["commercialisation of research", "IP monetisation", "industry-first innovation", "infrastructure expansion"],
          "SDG 10 - Reduced Inequalities": ["selective excellence", "targeting high-performing cohorts", "competitive scholarship models", "performance-based funding"],
          "SDG 12 - Responsible Consumption and Production": ["procurement efficiency", "cost-driven supply chain", "resource extraction", "waste externalisation"]
        },
        "Governance": {
          "SDG 17 - Partnerships for the Goals": ["exclusive partnerships", "commercial alliances", "competitive collaboration", "IP protectionism"]
        }
      }
    }
  },

  // ============================================
  // CYBERSECURITY FOCUS
  // ============================================
  {
    id: 'nist-csf',
    name: 'NIST Cybersecurity Framework',
    description: 'Keywords from the NIST Cybersecurity Framework core functions: Identify, Protect, Detect, Respond, Recover.',
    focus: 'cybersecurity',
    list_type: 'grouped',
    keywords: {
      "Identify": ["asset management", "asset inventory", "business environment", "governance", "risk assessment", "risk management strategy", "supply chain risk", "data classification", "critical assets", "system inventory", "network mapping", "information flows", "baseline configuration", "risk tolerance", "threat landscape", "vulnerability identification", "business impact analysis", "criticality assessment", "data mapping", "third-party risk"],
      "Protect": ["access control", "identity management", "authentication", "authorization", "awareness training", "security training", "data security", "encryption", "data protection", "information protection", "protective technology", "firewall", "intrusion prevention", "endpoint protection", "network segmentation", "secure configuration", "patch management", "vulnerability management", "privileged access", "multi-factor authentication", "mfa", "least privilege", "security architecture"],
      "Detect": ["anomaly detection", "continuous monitoring", "security monitoring", "detection processes", "event logging", "log analysis", "siem", "intrusion detection", "ids", "threat detection", "malware detection", "network monitoring", "behavioral analysis", "alert management", "security analytics", "threat intelligence", "indicator of compromise", "ioc", "suspicious activity", "detection capability"],
      "Respond": ["incident response", "response planning", "incident management", "communications", "incident analysis", "forensics", "mitigation", "containment", "eradication", "incident reporting", "escalation", "response team", "playbook", "tabletop exercise", "crisis management", "stakeholder notification", "breach response", "coordination", "lessons learned", "post-incident review"],
      "Recover": ["recovery planning", "disaster recovery", "business continuity", "backup", "restoration", "improvements", "recovery strategy", "recovery time objective", "rto", "recovery point objective", "rpo", "resilience", "system restoration", "data recovery", "failover", "redundancy", "continuity planning", "recovery testing", "communication plan", "reputation recovery"]
    }
  },
  {
    id: 'iso-27001',
    name: 'ISO 27001 Information Security',
    description: 'Keywords from ISO 27001 information security management system controls.',
    focus: 'cybersecurity',
    list_type: 'grouped',
    keywords: {
      "Organizational Controls": ["information security policy", "security roles", "segregation of duties", "management responsibility", "contact with authorities", "threat intelligence", "project security", "asset inventory", "acceptable use", "information classification", "information labeling", "information transfer", "access control policy", "identity management", "authentication information", "access rights", "supplier security", "cloud security", "incident management", "business continuity", "legal compliance", "security review"],
      "People Controls": ["screening", "employment terms", "security awareness", "disciplinary process", "termination responsibilities", "confidentiality agreements", "remote working", "security event reporting", "personnel security", "user responsibilities", "clear desk policy", "background verification", "training program", "competence", "security culture"],
      "Physical Controls": ["security perimeters", "physical entry", "office security", "physical security monitoring", "environmental threats", "secure areas", "clear desk", "equipment siting", "equipment security", "secure disposal", "utility services", "cabling security", "equipment maintenance", "off-premises security", "storage media", "visitor management", "delivery areas"],
      "Technological Controls": ["endpoint devices", "privileged access", "information access", "source code access", "secure authentication", "capacity management", "malware protection", "vulnerability management", "configuration management", "information deletion", "data masking", "data leakage prevention", "dlp", "backup", "redundancy", "logging", "monitoring", "clock synchronization", "software installation", "network security", "network segmentation", "web filtering", "cryptography", "secure development", "security testing", "outsourced development", "change management"]
    }
  },
  {
    id: 'cis-controls',
    name: 'CIS Critical Security Controls',
    description: 'Keywords from the Center for Internet Security (CIS) Critical Security Controls.',
    focus: 'cybersecurity',
    list_type: 'grouped',
    keywords: {
      "Basic Controls": ["hardware inventory", "software inventory", "data protection", "secure configuration", "account management", "access control management", "vulnerability management", "audit log management", "email security", "web browser security", "malware defense", "data recovery", "network infrastructure", "security awareness", "service provider management", "application security", "incident response", "penetration testing"],
      "Foundational Controls": ["boundary defense", "data loss prevention", "wireless access control", "account monitoring", "security skills assessment", "application software security", "incident response management", "penetration tests", "red team exercises", "secure network engineering", "network monitoring and defense", "security architecture"],
      "Implementation Groups": ["ig1 basic hygiene", "ig2 growing organization", "ig3 mature organization", "essential controls", "foundational controls", "organizational controls", "safeguards", "implementation priority", "maturity model", "control assessment", "gap analysis", "remediation plan", "security baseline"]
    }
  },
  {
    id: 'mitre-attack',
    name: 'MITRE ATT&CK Framework',
    description: 'Keywords from the MITRE ATT&CK framework for adversary tactics and techniques.',
    focus: 'cybersecurity',
    list_type: 'grouped',
    keywords: {
      "Tactics": ["reconnaissance", "resource development", "initial access", "execution", "persistence", "privilege escalation", "defense evasion", "credential access", "discovery", "lateral movement", "collection", "command and control", "exfiltration", "impact"],
      "Common Techniques": ["phishing", "spearphishing", "drive-by compromise", "exploit public-facing application", "supply chain compromise", "valid accounts", "command line interface", "powershell", "scripting", "scheduled task", "registry run keys", "dll injection", "process injection", "access token manipulation", "brute force", "credential dumping", "pass the hash", "remote services", "data staged", "encrypted channel", "data encrypted for impact", "ransomware", "data destruction"],
      "Threat Intelligence": ["threat actor", "advanced persistent threat", "apt", "campaign", "intrusion set", "malware family", "tool", "attack pattern", "indicator", "course of action", "threat hunting", "behavioral detection", "sigma rules", "yara rules", "ioc", "ttp", "kill chain", "diamond model", "threat modeling"]
    }
  },

  // ============================================
  // FINANCE FOCUS
  // ============================================
  {
    id: 'financial-ratios',
    name: 'Financial Ratios & Metrics',
    description: 'Keywords for financial analysis including profitability, liquidity, and solvency ratios.',
    focus: 'finance',
    list_type: 'grouped',
    keywords: {
      "Profitability Ratios": ["gross profit margin", "operating profit margin", "net profit margin", "return on assets", "roa", "return on equity", "roe", "return on investment", "roi", "return on capital employed", "roce", "earnings per share", "eps", "price to earnings", "p/e ratio", "ebitda", "ebitda margin", "operating income", "net income", "gross margin", "contribution margin", "operating leverage", "profit margin"],
      "Liquidity Ratios": ["current ratio", "quick ratio", "acid test", "cash ratio", "working capital", "working capital ratio", "operating cash flow ratio", "cash conversion cycle", "days sales outstanding", "dso", "days payable outstanding", "dpo", "days inventory outstanding", "dio", "net working capital", "liquidity coverage ratio", "lcr"],
      "Solvency Ratios": ["debt to equity", "debt ratio", "debt to assets", "interest coverage ratio", "times interest earned", "equity ratio", "financial leverage", "leverage ratio", "debt service coverage ratio", "dscr", "capitalization ratio", "long-term debt ratio", "total debt ratio", "gearing ratio", "net debt", "net debt to ebitda"],
      "Efficiency Ratios": ["asset turnover", "inventory turnover", "receivables turnover", "payables turnover", "fixed asset turnover", "total asset turnover", "capital turnover", "operating cycle", "cash cycle", "capacity utilization", "revenue per employee", "efficiency ratio"],
      "Valuation Metrics": ["market capitalization", "enterprise value", "ev", "price to book", "p/b ratio", "price to sales", "p/s ratio", "ev to ebitda", "dividend yield", "payout ratio", "book value", "intrinsic value", "fair value", "discounted cash flow", "dcf", "net present value", "npv", "internal rate of return", "irr", "weighted average cost of capital", "wacc"]
    }
  },
  {
    id: 'sec-regulations',
    name: 'SEC Regulations & Reporting',
    description: 'Keywords related to SEC filing requirements and financial reporting standards.',
    focus: 'finance',
    list_type: 'grouped',
    keywords: {
      "SEC Filings": ["form 10-k", "form 10-q", "form 8-k", "form s-1", "form 4", "proxy statement", "def 14a", "annual report", "quarterly report", "current report", "registration statement", "prospectus", "sec filing", "edgar", "material event", "earnings release", "earnings call", "guidance", "forward-looking statements"],
      "GAAP Standards": ["generally accepted accounting principles", "gaap", "revenue recognition", "asc 606", "lease accounting", "asc 842", "fair value measurement", "asc 820", "financial instruments", "consolidation", "segment reporting", "earnings per share", "stock compensation", "income taxes", "contingencies", "subsequent events", "going concern", "materiality", "disclosure requirements"],
      "Audit & Compliance": ["independent auditor", "audit opinion", "unqualified opinion", "qualified opinion", "adverse opinion", "disclaimer of opinion", "internal controls", "sox compliance", "sarbanes-oxley", "pcaob", "audit committee", "material weakness", "significant deficiency", "management assessment", "auditor attestation", "restatement", "non-reliance"],
      "Corporate Governance": ["board of directors", "audit committee", "compensation committee", "nominating committee", "independent director", "executive compensation", "say on pay", "proxy advisory", "shareholder proposal", "beneficial ownership", "insider trading", "regulation fd", "fair disclosure", "related party transaction", "conflict of interest", "fiduciary duty"]
    }
  },
  {
    id: 'basel-iii',
    name: 'Basel III Banking Regulations',
    description: 'Keywords from Basel III international banking regulatory framework.',
    focus: 'finance',
    list_type: 'grouped',
    keywords: {
      "Capital Requirements": ["tier 1 capital", "tier 2 capital", "common equity tier 1", "cet1", "risk-weighted assets", "rwa", "capital adequacy ratio", "car", "capital buffer", "countercyclical buffer", "capital conservation buffer", "systemic risk buffer", "leverage ratio", "minimum capital requirements", "regulatory capital", "capital planning", "stress testing", "capital stress test"],
      "Liquidity Standards": ["liquidity coverage ratio", "lcr", "net stable funding ratio", "nsfr", "high-quality liquid assets", "hqla", "liquidity risk", "funding risk", "liquidity buffer", "liquidity stress test", "intraday liquidity", "liquidity management", "contingency funding plan", "liquidity monitoring", "maturity mismatch"],
      "Risk Management": ["credit risk", "market risk", "operational risk", "counterparty credit risk", "credit valuation adjustment", "cva", "wrong-way risk", "concentration risk", "interest rate risk", "banking book", "trading book", "value at risk", "var", "expected shortfall", "stress testing", "scenario analysis", "risk appetite", "risk limits", "model risk"],
      "Regulatory Reporting": ["pillar 1", "pillar 2", "pillar 3", "regulatory reporting", "disclosure requirements", "supervisory review", "internal capital adequacy", "icaap", "recovery planning", "resolution planning", "living will", "systemically important bank", "sifi", "g-sib", "d-sib", "too big to fail"]
    }
  },
  {
    id: 'risk-metrics',
    name: 'Risk Management Metrics',
    description: 'Keywords for enterprise risk management and financial risk analysis.',
    focus: 'finance',
    list_type: 'grouped',
    keywords: {
      "Market Risk": ["value at risk", "var", "conditional var", "cvar", "expected shortfall", "beta", "alpha", "sharpe ratio", "sortino ratio", "treynor ratio", "information ratio", "tracking error", "volatility", "standard deviation", "correlation", "covariance", "monte carlo simulation", "historical simulation", "parametric var", "stress testing", "scenario analysis"],
      "Credit Risk": ["probability of default", "pd", "loss given default", "lgd", "exposure at default", "ead", "expected loss", "unexpected loss", "credit rating", "credit score", "creditworthiness", "credit spread", "credit default swap", "cds", "credit risk model", "credit portfolio", "concentration risk", "counterparty risk", "netting agreement", "collateral"],
      "Operational Risk": ["operational risk event", "loss event", "key risk indicator", "kri", "risk control self-assessment", "rcsa", "business continuity", "disaster recovery", "fraud risk", "cyber risk", "compliance risk", "legal risk", "reputational risk", "model risk", "third-party risk", "vendor risk", "people risk", "process risk", "systems risk"],
      "Enterprise Risk": ["risk appetite", "risk tolerance", "risk capacity", "risk limit", "risk exposure", "risk mitigation", "risk transfer", "risk acceptance", "risk avoidance", "risk register", "heat map", "risk matrix", "bow-tie analysis", "root cause analysis", "risk governance", "three lines of defense", "chief risk officer", "risk committee", "risk culture", "risk-adjusted return"]
    }
  },

  // ============================================
  // HEALTHCARE FOCUS
  // ============================================
  {
    id: 'clinical-trials',
    name: 'Clinical Trials & Research',
    description: 'Keywords for clinical research, trial phases, and study design.',
    focus: 'healthcare',
    list_type: 'grouped',
    keywords: {
      "Trial Phases": ["phase 1", "phase i", "phase 2", "phase ii", "phase 3", "phase iii", "phase 4", "phase iv", "preclinical", "first in human", "dose escalation", "dose finding", "proof of concept", "pivotal trial", "confirmatory trial", "post-marketing", "pharmacovigilance", "safety study", "efficacy study"],
      "Study Design": ["randomized controlled trial", "rct", "double-blind", "single-blind", "open-label", "placebo-controlled", "active-controlled", "crossover study", "parallel group", "adaptive design", "basket trial", "umbrella trial", "platform trial", "non-inferiority", "superiority", "equivalence", "intention to treat", "per protocol", "modified intention to treat"],
      "Endpoints & Outcomes": ["primary endpoint", "secondary endpoint", "surrogate endpoint", "clinical endpoint", "composite endpoint", "overall survival", "progression-free survival", "disease-free survival", "objective response rate", "complete response", "partial response", "stable disease", "time to progression", "quality of life", "patient-reported outcome", "pro", "adverse event", "serious adverse event", "sae"],
      "Regulatory & Compliance": ["informed consent", "institutional review board", "irb", "ethics committee", "good clinical practice", "gcp", "investigational new drug", "ind", "new drug application", "nda", "biologics license application", "bla", "clinical trial application", "cta", "data safety monitoring board", "dsmb", "protocol deviation", "protocol amendment", "site monitoring", "source data verification"]
    }
  },
  {
    id: 'fda-regulations',
    name: 'FDA Regulations & Compliance',
    description: 'Keywords for FDA regulatory requirements and drug approval process.',
    focus: 'healthcare',
    list_type: 'grouped',
    keywords: {
      "Drug Approval": ["new drug application", "nda", "abbreviated new drug application", "anda", "biologics license application", "bla", "investigational new drug", "ind", "pre-ind meeting", "end of phase meeting", "pre-nda meeting", "priority review", "standard review", "accelerated approval", "fast track", "breakthrough therapy", "orphan drug", "rare pediatric disease", "pdufa", "user fee"],
      "Manufacturing & Quality": ["good manufacturing practice", "gmp", "cgmp", "quality system", "quality control", "quality assurance", "batch record", "deviation", "capa", "corrective action", "preventive action", "validation", "process validation", "cleaning validation", "method validation", "stability testing", "expiration dating", "specification", "out of specification", "oos"],
      "Labeling & Marketing": ["prescribing information", "package insert", "medication guide", "patient labeling", "black box warning", "contraindication", "indication", "off-label use", "promotional material", "direct-to-consumer", "dtc advertising", "fair balance", "risk evaluation and mitigation strategy", "rems", "post-marketing requirement", "post-marketing commitment"],
      "Inspections & Enforcement": ["fda inspection", "form 483", "warning letter", "consent decree", "import alert", "recall", "market withdrawal", "safety alert", "medwatch", "adverse event reporting", "faers", "maude", "establishment inspection report", "eir", "compliance program", "regulatory action"]
    }
  },
  {
    id: 'hipaa',
    name: 'HIPAA Privacy & Security',
    description: 'Keywords for HIPAA healthcare privacy and security compliance.',
    focus: 'healthcare',
    list_type: 'grouped',
    keywords: {
      "Privacy Rule": ["protected health information", "phi", "individually identifiable", "covered entity", "business associate", "notice of privacy practices", "authorization", "consent", "minimum necessary", "de-identification", "limited data set", "designated record set", "accounting of disclosures", "access rights", "amendment rights", "restriction requests", "confidential communications", "privacy officer"],
      "Security Rule": ["administrative safeguards", "physical safeguards", "technical safeguards", "security management", "risk analysis", "risk management", "sanction policy", "information system activity review", "workforce security", "access management", "security awareness training", "security incident procedures", "contingency plan", "facility access controls", "workstation security", "device controls", "access control", "audit controls", "integrity controls", "transmission security", "encryption"],
      "Breach Notification": ["breach notification", "unsecured phi", "breach assessment", "notification requirements", "individual notification", "media notification", "hhs notification", "breach documentation", "harm threshold", "risk of harm", "low probability", "breach log"],
      "Enforcement": ["hipaa enforcement", "civil penalty", "criminal penalty", "corrective action plan", "resolution agreement", "hipaa audit", "ocr investigation", "complaint", "compliance review", "voluntary compliance", "technical assistance", "hipaa violation", "willful neglect"]
    }
  },
  {
    id: 'medical-terminology',
    name: 'Medical & Healthcare Terms',
    description: 'Common medical terminology for healthcare document analysis.',
    focus: 'healthcare',
    list_type: 'grouped',
    keywords: {
      "Diagnostics": ["diagnosis", "differential diagnosis", "prognosis", "etiology", "pathophysiology", "symptom", "sign", "syndrome", "comorbidity", "complication", "sequela", "acute", "chronic", "recurrent", "remission", "exacerbation", "staging", "grading", "biomarker", "laboratory test", "imaging", "biopsy", "histopathology"],
      "Treatment": ["treatment", "therapy", "intervention", "procedure", "surgery", "medication", "drug", "dose", "dosage", "regimen", "protocol", "standard of care", "first-line", "second-line", "adjuvant", "neoadjuvant", "palliative", "curative", "supportive care", "combination therapy", "monotherapy", "treatment response", "treatment failure", "resistance"],
      "Patient Care": ["patient", "inpatient", "outpatient", "admission", "discharge", "length of stay", "readmission", "emergency department", "intensive care", "icu", "ambulatory", "primary care", "specialty care", "referral", "consultation", "follow-up", "monitoring", "vital signs", "patient outcome", "patient safety", "quality of care", "care coordination"],
      "Healthcare Systems": ["hospital", "clinic", "health system", "provider", "physician", "nurse", "allied health", "electronic health record", "ehr", "medical record", "health information", "interoperability", "health information exchange", "hie", "telehealth", "telemedicine", "value-based care", "fee-for-service", "bundled payment", "accountable care organization", "aco"]
    }
  },

  // ============================================
  // LEGAL FOCUS
  // ============================================
  {
    id: 'contract-terms',
    name: 'Contract Terms & Clauses',
    description: 'Keywords for contract analysis and legal agreement review.',
    focus: 'legal',
    list_type: 'grouped',
    keywords: {
      "Core Terms": ["party", "parties", "agreement", "contract", "effective date", "term", "termination", "renewal", "consideration", "obligations", "rights", "duties", "performance", "breach", "remedy", "damages", "liability", "indemnification", "warranty", "representation", "covenant", "condition precedent", "condition subsequent"],
      "Standard Clauses": ["force majeure", "limitation of liability", "indemnity", "confidentiality", "non-disclosure", "non-compete", "non-solicitation", "assignment", "severability", "entire agreement", "amendment", "waiver", "governing law", "jurisdiction", "dispute resolution", "arbitration", "mediation", "notice", "survival", "counterparts"],
      "Commercial Terms": ["payment terms", "pricing", "fees", "expenses", "invoice", "net 30", "net 60", "milestone", "deliverable", "acceptance", "rejection", "warranty period", "service level", "sla", "penalty", "liquidated damages", "escrow", "security deposit", "insurance requirements", "audit rights"],
      "IP & Data": ["intellectual property", "ownership", "license", "license grant", "perpetual license", "exclusive license", "non-exclusive license", "sublicense", "work for hire", "assignment of rights", "background ip", "foreground ip", "joint ip", "data protection", "data processing", "data controller", "data processor", "personal data", "privacy"]
    }
  },
  {
    id: 'regulatory-language',
    name: 'Regulatory & Compliance Language',
    description: 'Keywords for regulatory compliance documents and policy analysis.',
    focus: 'legal',
    list_type: 'grouped',
    keywords: {
      "Compliance Framework": ["compliance", "regulatory compliance", "legal compliance", "policy compliance", "compliance program", "compliance officer", "compliance committee", "compliance monitoring", "compliance audit", "compliance review", "compliance risk", "compliance training", "compliance culture", "compliance framework", "regulatory requirement", "statutory requirement", "obligation"],
      "Regulatory Actions": ["regulation", "rule", "statute", "law", "ordinance", "directive", "guidance", "advisory", "enforcement", "sanction", "penalty", "fine", "cease and desist", "consent order", "settlement", "remediation", "corrective action", "regulatory approval", "license", "permit", "registration", "certification"],
      "Due Diligence": ["due diligence", "know your customer", "kyc", "anti-money laundering", "aml", "sanctions screening", "background check", "risk assessment", "third-party due diligence", "vendor due diligence", "enhanced due diligence", "ongoing monitoring", "suspicious activity", "red flag", "politically exposed person", "pep", "beneficial owner", "ultimate beneficial owner"],
      "Reporting & Disclosure": ["disclosure", "material disclosure", "mandatory disclosure", "voluntary disclosure", "reporting requirement", "filing requirement", "notification requirement", "annual report", "periodic report", "incident report", "suspicious activity report", "sar", "currency transaction report", "ctr", "recordkeeping", "document retention", "audit trail"]
    }
  },
  {
    id: 'legal-clauses',
    name: 'Legal Provisions & Remedies',
    description: 'Keywords for legal provisions, remedies, and dispute resolution.',
    focus: 'legal',
    list_type: 'grouped',
    keywords: {
      "Dispute Resolution": ["dispute", "controversy", "claim", "litigation", "lawsuit", "arbitration", "mediation", "negotiation", "settlement", "resolution", "binding arbitration", "non-binding arbitration", "arbitration clause", "forum selection", "venue", "choice of law", "applicable law", "injunctive relief", "specific performance", "declaratory judgment"],
      "Liability & Damages": ["liability", "limited liability", "unlimited liability", "joint liability", "several liability", "joint and several liability", "direct damages", "indirect damages", "consequential damages", "incidental damages", "punitive damages", "exemplary damages", "compensatory damages", "actual damages", "special damages", "general damages", "cap on damages", "exclusion of damages", "mitigation of damages"],
      "Intellectual Property": ["patent", "trademark", "copyright", "trade secret", "intellectual property rights", "infringement", "misappropriation", "dilution", "passing off", "unfair competition", "license agreement", "royalty", "assignment", "ip indemnity", "ip warranty", "prior art", "patent pending", "registered trademark", "copyright notice"],
      "Corporate & M&A": ["merger", "acquisition", "divestiture", "joint venture", "shareholders agreement", "stock purchase", "asset purchase", "due diligence", "closing", "closing conditions", "material adverse change", "mac clause", "representations and warranties", "disclosure schedule", "escrow", "earnout", "holdback", "purchase price adjustment", "working capital adjustment"]
    }
  },
  {
    id: 'compliance-keywords',
    name: 'Compliance & Ethics Keywords',
    description: 'Keywords for ethics, compliance, and corporate governance review.',
    focus: 'legal',
    list_type: 'grouped',
    keywords: {
      "Ethics & Conduct": ["ethics", "ethical conduct", "code of conduct", "code of ethics", "business ethics", "professional ethics", "integrity", "honesty", "fairness", "transparency", "accountability", "responsibility", "conflict of interest", "gift policy", "entertainment policy", "anti-bribery", "anti-corruption", "fcpa", "uk bribery act", "whistleblower", "hotline", "speak up"],
      "Corporate Governance": ["corporate governance", "board of directors", "board oversight", "fiduciary duty", "duty of care", "duty of loyalty", "shareholder rights", "stakeholder", "proxy", "voting rights", "annual meeting", "special meeting", "board committee", "audit committee", "compensation committee", "nominating committee", "independent director", "executive session", "related party transaction"],
      "Privacy & Data Protection": ["privacy", "data protection", "gdpr", "ccpa", "personal information", "sensitive data", "data subject", "consent", "lawful basis", "data minimization", "purpose limitation", "storage limitation", "data breach", "breach notification", "data transfer", "cross-border transfer", "privacy by design", "data protection officer", "dpo", "privacy impact assessment", "pia"],
      "Employment Law": ["employment", "employee", "employer", "employment agreement", "at-will employment", "wrongful termination", "discrimination", "harassment", "retaliation", "reasonable accommodation", "equal opportunity", "affirmative action", "wage and hour", "overtime", "minimum wage", "leave of absence", "fmla", "workers compensation", "unemployment", "collective bargaining", "union"]
    }
  },

  // ============================================
  // ACADEMIC RESEARCH FOCUS
  // ============================================
  {
    id: 'research-methods',
    name: 'Research Methodology',
    description: 'Keywords for academic research methods and study design.',
    focus: 'academic',
    list_type: 'grouped',
    keywords: {
      "Research Design": ["research design", "methodology", "method", "approach", "framework", "paradigm", "epistemology", "ontology", "positivism", "interpretivism", "constructivism", "pragmatism", "mixed methods", "triangulation", "validity", "reliability", "generalizability", "transferability", "replicability", "rigor"],
      "Quantitative Methods": ["quantitative research", "experimental design", "quasi-experimental", "survey research", "longitudinal study", "cross-sectional study", "cohort study", "case-control", "randomized", "control group", "treatment group", "sample size", "power analysis", "effect size", "statistical significance", "hypothesis testing", "null hypothesis", "alternative hypothesis", "variable", "independent variable", "dependent variable", "confounding variable"],
      "Qualitative Methods": ["qualitative research", "case study", "ethnography", "phenomenology", "grounded theory", "narrative research", "action research", "interview", "focus group", "observation", "participant observation", "field notes", "thick description", "coding", "thematic analysis", "content analysis", "discourse analysis", "saturation", "member checking", "reflexivity"],
      "Data Collection": ["data collection", "primary data", "secondary data", "sampling", "random sampling", "stratified sampling", "purposive sampling", "snowball sampling", "convenience sampling", "questionnaire", "survey instrument", "interview protocol", "informed consent", "anonymity", "confidentiality", "ethical approval", "irb approval", "data management", "data storage"]
    }
  },
  {
    id: 'statistical-terms',
    name: 'Statistical Analysis Terms',
    description: 'Keywords for statistical analysis and data interpretation.',
    focus: 'academic',
    list_type: 'grouped',
    keywords: {
      "Descriptive Statistics": ["mean", "median", "mode", "standard deviation", "variance", "range", "interquartile range", "iqr", "percentile", "quartile", "frequency", "distribution", "normal distribution", "skewness", "kurtosis", "outlier", "central tendency", "dispersion", "descriptive statistics", "summary statistics"],
      "Inferential Statistics": ["hypothesis test", "t-test", "anova", "chi-square", "correlation", "regression", "linear regression", "multiple regression", "logistic regression", "p-value", "confidence interval", "significance level", "alpha", "beta", "type i error", "type ii error", "statistical power", "degrees of freedom", "f-statistic", "t-statistic", "z-score"],
      "Advanced Methods": ["multivariate analysis", "factor analysis", "principal component analysis", "pca", "cluster analysis", "discriminant analysis", "structural equation modeling", "sem", "path analysis", "multilevel modeling", "hierarchical linear modeling", "hlm", "time series analysis", "survival analysis", "meta-analysis", "systematic review", "bayesian analysis", "machine learning", "predictive modeling"],
      "Data Quality": ["missing data", "imputation", "listwise deletion", "pairwise deletion", "measurement error", "reliability coefficient", "cronbachs alpha", "inter-rater reliability", "test-retest reliability", "construct validity", "content validity", "criterion validity", "convergent validity", "discriminant validity", "face validity", "internal validity", "external validity"]
    }
  },
  {
    id: 'literature-review',
    name: 'Literature Review Terms',
    description: 'Keywords for systematic literature review and academic writing.',
    focus: 'academic',
    list_type: 'grouped',
    keywords: {
      "Review Types": ["literature review", "systematic review", "meta-analysis", "scoping review", "narrative review", "integrative review", "critical review", "umbrella review", "rapid review", "state of the art", "theoretical framework", "conceptual framework", "research gap", "knowledge gap", "research agenda"],
      "Search & Selection": ["search strategy", "database search", "keyword search", "boolean operators", "inclusion criteria", "exclusion criteria", "screening", "title screening", "abstract screening", "full-text screening", "prisma", "prisma flow diagram", "hand searching", "citation searching", "forward citation", "backward citation", "grey literature", "snowballing"],
      "Analysis & Synthesis": ["data extraction", "quality assessment", "risk of bias", "critical appraisal", "evidence synthesis", "thematic synthesis", "narrative synthesis", "framework synthesis", "heterogeneity", "homogeneity", "effect size", "forest plot", "funnel plot", "publication bias", "sensitivity analysis", "subgroup analysis"],
      "Academic Writing": ["thesis", "dissertation", "manuscript", "journal article", "peer review", "peer-reviewed", "abstract", "introduction", "literature review", "methodology", "results", "discussion", "conclusion", "implications", "limitations", "future research", "contribution", "theoretical contribution", "practical contribution", "reference", "citation", "bibliography"]
    }
  },
  {
    id: 'citation-analysis',
    name: 'Citation & Impact Analysis',
    description: 'Keywords for bibliometric analysis and research impact assessment.',
    focus: 'academic',
    list_type: 'grouped',
    keywords: {
      "Citation Metrics": ["citation", "citation count", "citation analysis", "bibliometrics", "scientometrics", "h-index", "h index", "g-index", "i10-index", "citation impact", "times cited", "self-citation", "co-citation", "bibliographic coupling", "citation network", "citation burst", "highly cited", "citation classic"],
      "Journal Metrics": ["impact factor", "journal impact factor", "jif", "cite score", "scimago journal rank", "sjr", "source normalized impact", "snip", "eigenfactor", "article influence score", "immediacy index", "journal ranking", "quartile", "q1 journal", "open access", "predatory journal"],
      "Research Impact": ["research impact", "academic impact", "societal impact", "altmetrics", "attention score", "social media mentions", "news mentions", "policy citations", "patent citations", "download count", "view count", "readership", "mendeley readers", "research visibility", "knowledge transfer", "research translation"],
      "Collaboration": ["collaboration", "co-authorship", "research collaboration", "international collaboration", "interdisciplinary", "multidisciplinary", "transdisciplinary", "research network", "collaboration network", "corresponding author", "first author", "senior author", "author contribution", "orcid", "researcher id"]
    }
  },

  // ============================================
  // PROJECT MANAGEMENT FOCUS
  // ============================================
  {
    id: 'agile-scrum',
    name: 'Agile & Scrum Methodology',
    description: 'Keywords for Agile and Scrum project management practices.',
    focus: 'project-management',
    list_type: 'grouped',
    keywords: {
      "Agile Principles": ["agile", "agile manifesto", "iterative", "incremental", "adaptive", "flexibility", "collaboration", "customer collaboration", "responding to change", "working software", "individuals and interactions", "continuous improvement", "self-organizing team", "cross-functional team", "agile mindset", "agile transformation", "agile coach", "agile maturity"],
      "Scrum Framework": ["scrum", "sprint", "sprint planning", "sprint review", "sprint retrospective", "daily scrum", "daily standup", "scrum master", "product owner", "development team", "scrum team", "sprint backlog", "product backlog", "backlog refinement", "backlog grooming", "definition of done", "definition of ready", "increment", "potentially shippable"],
      "Artifacts & Events": ["user story", "epic", "theme", "acceptance criteria", "story points", "velocity", "burndown chart", "burnup chart", "sprint goal", "release planning", "release train", "safe", "scaled agile", "kanban", "kanban board", "wip limit", "lead time", "cycle time", "throughput", "cumulative flow diagram"],
      "Roles & Ceremonies": ["product owner", "scrum master", "team member", "stakeholder", "chicken and pig", "sprint planning", "daily standup", "sprint review", "sprint retrospective", "backlog refinement", "estimation", "planning poker", "relative estimation", "t-shirt sizing", "fibonacci sequence", "timeboxing", "facilitation", "impediment", "blocker"]
    }
  },
  {
    id: 'pmbok',
    name: 'PMBOK Guide Processes',
    description: 'Keywords from the Project Management Body of Knowledge (PMBOK) Guide.',
    focus: 'project-management',
    list_type: 'grouped',
    keywords: {
      "Process Groups": ["initiating", "planning", "executing", "monitoring and controlling", "closing", "project lifecycle", "phase gate", "process group", "knowledge area", "project charter", "project management plan", "deliverable", "work performance data", "work performance information", "work performance report", "change request", "lessons learned"],
      "Knowledge Areas": ["integration management", "scope management", "schedule management", "cost management", "quality management", "resource management", "communications management", "risk management", "procurement management", "stakeholder management", "project scope", "wbs", "work breakdown structure", "schedule baseline", "cost baseline", "quality baseline"],
      "Planning & Control": ["scope statement", "requirements", "milestone", "critical path", "float", "slack", "gantt chart", "network diagram", "pert", "earned value", "ev", "planned value", "pv", "actual cost", "ac", "schedule variance", "sv", "cost variance", "cv", "schedule performance index", "spi", "cost performance index", "cpi", "estimate at completion", "eac", "estimate to complete", "etc"],
      "Stakeholder & Communication": ["stakeholder analysis", "stakeholder register", "stakeholder engagement", "power interest grid", "communication plan", "communication matrix", "status report", "progress report", "escalation", "change control", "change control board", "ccb", "configuration management", "issue log", "action item", "decision log", "raid log"]
    }
  },
  {
    id: 'risk-management-pm',
    name: 'Project Risk Management',
    description: 'Keywords for project risk identification, analysis, and response.',
    focus: 'project-management',
    list_type: 'grouped',
    keywords: {
      "Risk Identification": ["risk", "risk identification", "risk register", "risk log", "risk category", "risk source", "risk trigger", "risk event", "threat", "opportunity", "assumption", "constraint", "dependency", "external risk", "internal risk", "technical risk", "organizational risk", "project management risk"],
      "Risk Analysis": ["risk analysis", "qualitative risk analysis", "quantitative risk analysis", "probability", "impact", "risk score", "risk rating", "risk matrix", "probability impact matrix", "risk priority", "high risk", "medium risk", "low risk", "risk threshold", "risk tolerance", "risk appetite", "expected monetary value", "emv", "decision tree", "monte carlo analysis", "sensitivity analysis", "tornado diagram"],
      "Risk Response": ["risk response", "risk response strategy", "avoid", "mitigate", "transfer", "accept", "exploit", "enhance", "share", "escalate", "contingency plan", "fallback plan", "contingency reserve", "management reserve", "risk owner", "risk action", "residual risk", "secondary risk", "workaround"],
      "Risk Monitoring": ["risk monitoring", "risk review", "risk audit", "risk reassessment", "variance analysis", "trend analysis", "risk reporting", "risk dashboard", "key risk indicator", "kri", "early warning sign", "risk trigger", "risk status", "risk response effectiveness", "lessons learned"]
    }
  },
  {
    id: 'resource-planning',
    name: 'Resource & Capacity Planning',
    description: 'Keywords for project resource management and capacity planning.',
    focus: 'project-management',
    list_type: 'grouped',
    keywords: {
      "Resource Planning": ["resource planning", "resource management", "resource allocation", "resource assignment", "resource calendar", "resource availability", "resource requirement", "resource breakdown structure", "rbs", "organizational breakdown structure", "obs", "responsibility assignment matrix", "ram", "raci matrix", "responsible", "accountable", "consulted", "informed"],
      "Capacity Management": ["capacity planning", "capacity management", "workload", "utilization", "availability", "allocation", "over-allocation", "under-allocation", "resource leveling", "resource smoothing", "resource optimization", "bottleneck", "constraint", "critical resource", "scarce resource", "shared resource", "dedicated resource"],
      "Team Management": ["team", "project team", "team building", "team development", "forming", "storming", "norming", "performing", "adjourning", "team charter", "ground rules", "colocation", "virtual team", "team performance", "team assessment", "conflict management", "conflict resolution", "negotiation", "motivation", "recognition", "reward"],
      "Budget & Cost": ["budget", "project budget", "cost estimate", "cost baseline", "cost control", "budget at completion", "bac", "actual cost", "planned value", "earned value", "variance", "forecast", "funding", "funding limit", "cash flow", "cost of quality", "direct cost", "indirect cost", "fixed cost", "variable cost", "sunk cost", "opportunity cost"]
    }
  },

  // ============================================
  // GENERAL DOMAIN KEYWORD LISTS
  // Non-framework-specific keywords for each focus
  // ============================================
  {
    id: 'sustainability-general',
    name: 'Sustainability - General Domain Keywords',
    description: 'Common sustainability and ESG terminology for general document analysis without framework-specific constraints.',
    focus: 'sustainability',
    list_type: 'grouped',
    keywords: {
      "Environmental": ["environment", "environmental", "sustainability", "sustainable", "green", "eco-friendly", "carbon", "emissions", "pollution", "waste", "recycling", "renewable", "clean energy", "conservation", "biodiversity", "ecosystem", "climate", "water", "air quality", "natural resources", "deforestation", "habitat", "wildlife"],
      "Social": ["social", "community", "stakeholder", "employee", "workforce", "diversity", "inclusion", "equity", "human rights", "labor", "labour", "health and safety", "wellbeing", "well-being", "training", "development", "engagement", "supply chain", "fair trade", "indigenous", "local community", "philanthropy", "volunteering"],
      "Governance": ["governance", "ethics", "ethical", "transparency", "accountability", "compliance", "regulation", "policy", "board", "oversight", "audit", "risk management", "internal controls", "anti-corruption", "bribery", "whistleblower", "disclosure", "reporting", "assurance", "verification"],
      "Strategy & Performance": ["esg", "corporate responsibility", "csr", "sustainable development", "triple bottom line", "materiality", "stakeholder engagement", "long-term value", "resilience", "circular economy", "net zero", "carbon neutral", "science-based", "targets", "goals", "progress", "performance", "metrics", "indicators", "benchmarking", "best practice", "continuous improvement", "innovation", "transformation"]
    }
  },
  {
    id: 'cybersecurity-general',
    name: 'Cybersecurity - General Domain Keywords',
    description: 'Common cybersecurity and information security terminology for general document analysis without framework-specific constraints.',
    focus: 'cybersecurity',
    list_type: 'grouped',
    keywords: {
      "Security Fundamentals": ["security", "cybersecurity", "information security", "data security", "privacy", "confidentiality", "integrity", "availability", "authentication", "authorization", "access control", "encryption", "password", "credential", "identity", "permission", "privilege", "secure", "protection", "defense"],
      "Threats & Attacks": ["threat", "attack", "breach", "hack", "hacker", "malware", "virus", "ransomware", "phishing", "spam", "vulnerability", "exploit", "compromise", "intrusion", "unauthorized", "suspicious", "malicious", "cyber attack", "data breach", "security incident", "threat actor", "adversary"],
      "Security Operations": ["firewall", "antivirus", "monitoring", "detection", "prevention", "response", "recovery", "backup", "patch", "update", "scan", "audit", "log", "alert", "incident", "investigation", "forensics", "remediation", "mitigation", "containment"],
      "Compliance & Governance": ["compliance", "regulation", "policy", "standard", "framework", "control", "risk", "assessment", "audit", "certification", "training", "awareness", "governance", "procedure", "guideline", "best practice", "due diligence", "third party", "vendor", "supply chain"],
      "Technology & Infrastructure": ["network", "server", "endpoint", "cloud", "database", "application", "software", "hardware", "infrastructure", "system", "device", "mobile", "wireless", "internet", "email", "web", "remote", "vpn", "configuration", "architecture"]
    }
  },
  {
    id: 'finance-general',
    name: 'Finance - General Domain Keywords',
    description: 'Common financial and business terminology for general document analysis without framework-specific constraints.',
    focus: 'finance',
    list_type: 'grouped',
    keywords: {
      "Financial Performance": ["revenue", "sales", "income", "profit", "loss", "earnings", "margin", "growth", "decline", "performance", "results", "financial", "fiscal", "quarterly", "annual", "year-over-year", "forecast", "outlook", "guidance", "target"],
      "Assets & Liabilities": ["asset", "liability", "equity", "capital", "debt", "loan", "credit", "cash", "investment", "property", "inventory", "receivable", "payable", "depreciation", "amortization", "impairment", "write-off", "reserve", "provision", "balance sheet"],
      "Operations & Costs": ["cost", "expense", "overhead", "operating", "efficiency", "productivity", "margin", "budget", "spending", "saving", "reduction", "optimization", "restructuring", "synergy", "integration", "acquisition", "merger", "divestiture", "expansion", "consolidation"],
      "Market & Valuation": ["market", "share", "stock", "price", "value", "valuation", "investor", "shareholder", "dividend", "return", "yield", "appreciation", "trading", "exchange", "portfolio", "fund", "benchmark", "index", "volatility", "liquidity"],
      "Risk & Control": ["risk", "exposure", "hedge", "insurance", "contingency", "compliance", "regulation", "audit", "control", "governance", "oversight", "disclosure", "transparency", "fiduciary", "material", "significant", "adverse", "uncertainty", "sensitivity", "stress test"]
    }
  },
  {
    id: 'healthcare-general',
    name: 'Healthcare - General Domain Keywords',
    description: 'Common healthcare and medical terminology for general document analysis without framework-specific constraints.',
    focus: 'healthcare',
    list_type: 'grouped',
    keywords: {
      "Clinical Care": ["patient", "care", "treatment", "therapy", "diagnosis", "clinical", "medical", "health", "disease", "condition", "symptom", "outcome", "recovery", "prevention", "screening", "intervention", "procedure", "surgery", "medication", "prescription", "dosage", "side effect"],
      "Healthcare Delivery": ["hospital", "clinic", "physician", "doctor", "nurse", "provider", "specialist", "primary care", "emergency", "inpatient", "outpatient", "admission", "discharge", "referral", "appointment", "visit", "consultation", "telemedicine", "telehealth", "home care"],
      "Quality & Safety": ["quality", "safety", "error", "adverse event", "complication", "infection", "mortality", "morbidity", "readmission", "outcome", "measure", "indicator", "benchmark", "accreditation", "standard", "guideline", "protocol", "best practice", "evidence-based", "improvement"],
      "Research & Development": ["research", "study", "trial", "clinical trial", "drug", "pharmaceutical", "biotech", "innovation", "discovery", "development", "approval", "efficacy", "safety", "data", "evidence", "publication", "peer review", "breakthrough", "pipeline", "therapeutic"],
      "Policy & Administration": ["policy", "regulation", "compliance", "coverage", "insurance", "reimbursement", "cost", "spending", "access", "equity", "disparity", "population health", "public health", "prevention", "wellness", "chronic", "management", "coordination", "integration", "reform"]
    }
  },
  {
    id: 'legal-general',
    name: 'Legal - General Domain Keywords',
    description: 'Common legal and regulatory terminology for general document analysis without framework-specific constraints.',
    focus: 'legal',
    list_type: 'grouped',
    keywords: {
      "Legal Fundamentals": ["law", "legal", "court", "judge", "attorney", "lawyer", "counsel", "party", "plaintiff", "defendant", "case", "matter", "proceeding", "hearing", "trial", "judgment", "ruling", "decision", "precedent", "jurisdiction"],
      "Contracts & Agreements": ["contract", "agreement", "term", "condition", "obligation", "right", "duty", "breach", "remedy", "damages", "liability", "indemnity", "warranty", "representation", "covenant", "termination", "renewal", "amendment", "waiver", "assignment"],
      "Regulatory & Compliance": ["regulation", "regulatory", "compliance", "requirement", "standard", "rule", "policy", "procedure", "guideline", "enforcement", "penalty", "fine", "sanction", "violation", "infringement", "audit", "inspection", "license", "permit", "approval"],
      "Dispute Resolution": ["dispute", "claim", "allegation", "litigation", "lawsuit", "arbitration", "mediation", "settlement", "negotiation", "resolution", "appeal", "injunction", "motion", "discovery", "evidence", "testimony", "witness", "deposition", "subpoena", "verdict"],
      "Corporate & Commercial": ["corporate", "company", "business", "entity", "shareholder", "director", "officer", "fiduciary", "governance", "merger", "acquisition", "transaction", "due diligence", "disclosure", "confidential", "proprietary", "intellectual property", "trade secret", "non-compete", "non-disclosure"]
    }
  },
  {
    id: 'academic-general',
    name: 'Academic - General Domain Keywords',
    description: 'Common academic and scholarly terminology for general document analysis without methodology-specific constraints.',
    focus: 'academic',
    list_type: 'grouped',
    keywords: {
      "Research Process": ["research", "study", "investigation", "inquiry", "exploration", "analysis", "examination", "assessment", "evaluation", "review", "survey", "experiment", "observation", "measurement", "data", "sample", "participant", "subject", "population", "findings"],
      "Scholarly Writing": ["thesis", "hypothesis", "theory", "framework", "model", "concept", "construct", "variable", "factor", "dimension", "argument", "claim", "evidence", "support", "conclusion", "implication", "limitation", "contribution", "significance", "relevance"],
      "Literature & Sources": ["literature", "source", "reference", "citation", "author", "publication", "journal", "article", "paper", "book", "chapter", "volume", "issue", "edition", "peer review", "scholarly", "academic", "empirical", "theoretical", "seminal"],
      "Analysis & Results": ["result", "outcome", "effect", "impact", "relationship", "correlation", "association", "difference", "comparison", "trend", "pattern", "theme", "category", "significant", "substantial", "notable", "consistent", "inconsistent", "unexpected", "preliminary"],
      "Academic Context": ["discipline", "field", "domain", "area", "topic", "issue", "problem", "question", "gap", "debate", "discourse", "perspective", "approach", "paradigm", "tradition", "school of thought", "interdisciplinary", "multidisciplinary", "emerging", "contemporary"]
    }
  },
  {
    id: 'project-management-general',
    name: 'Project Management - General Domain Keywords',
    description: 'Common project management terminology for general document analysis without methodology-specific constraints.',
    focus: 'project-management',
    list_type: 'grouped',
    keywords: {
      "Project Fundamentals": ["project", "program", "portfolio", "initiative", "objective", "goal", "scope", "requirement", "deliverable", "outcome", "benefit", "value", "success", "criteria", "constraint", "assumption", "dependency", "priority", "phase", "stage"],
      "Planning & Scheduling": ["plan", "planning", "schedule", "timeline", "milestone", "deadline", "duration", "estimate", "forecast", "baseline", "target", "task", "activity", "work", "effort", "critical", "path", "sequence", "parallel", "lead time"],
      "Resources & Budget": ["resource", "team", "staff", "personnel", "skill", "capacity", "allocation", "availability", "workload", "budget", "cost", "expense", "funding", "investment", "spending", "variance", "overrun", "underrun", "contingency", "reserve"],
      "Execution & Control": ["execution", "implementation", "progress", "status", "update", "report", "review", "meeting", "tracking", "monitoring", "control", "change", "issue", "problem", "risk", "action", "decision", "escalation", "resolution", "approval"],
      "Stakeholders & Communication": ["stakeholder", "sponsor", "client", "customer", "user", "manager", "leader", "member", "role", "responsibility", "communication", "collaboration", "coordination", "alignment", "engagement", "expectation", "feedback", "acceptance", "sign-off", "handover"]
    }
  }
]

export function initDatabase(): Database.Database {
  if (db) return db

  // Get user data directory
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'document-lens.db')

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  console.log('Initializing database at:', dbPath)

  // Create database
  db = new Database(dbPath)
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON')
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')

  // Create schema
  db.exec(SCHEMA)

  // Migrate existing project_id relationships to junction table
  migrateProjectDocuments(db)

  // Add focus columns if they don't exist (also migrates old theme columns)
  migrateFocusColumns(db)

  // Seed default data if needed
  seedDefaultData(db)

  return db
}

/**
 * Add focus columns to projects and keyword_lists tables if they don't exist.
 * Also migrates old 'theme' column to 'focus' if needed.
 * This migration supports the research focus system for different research domains.
 */
function migrateFocusColumns(database: Database.Database) {
  const projectColumns = database.prepare("PRAGMA table_info(projects)").all() as { name: string }[]
  const keywordColumns = database.prepare("PRAGMA table_info(keyword_lists)").all() as { name: string }[]

  // Check for old 'theme' column and migrate to 'focus'
  const hasProjectTheme = projectColumns.some(col => col.name === 'theme')
  const hasProjectFocus = projectColumns.some(col => col.name === 'focus')

  if (hasProjectTheme && !hasProjectFocus) {
    console.log('Migrating projects.theme to projects.focus...')
    database.exec("ALTER TABLE projects RENAME COLUMN theme TO focus")
  } else if (!hasProjectFocus) {
    console.log('Adding focus column to projects table...')
    database.exec("ALTER TABLE projects ADD COLUMN focus TEXT DEFAULT 'sustainability'")
  }

  // Check for old 'theme' column in keyword_lists and migrate to 'focus'
  const hasKeywordTheme = keywordColumns.some(col => col.name === 'theme')
  const hasKeywordFocus = keywordColumns.some(col => col.name === 'focus')

  if (hasKeywordTheme && !hasKeywordFocus) {
    console.log('Migrating keyword_lists.theme to keyword_lists.focus...')
    database.exec("ALTER TABLE keyword_lists RENAME COLUMN theme TO focus")
  } else if (!hasKeywordFocus) {
    console.log('Adding focus column to keyword_lists table...')
    database.exec("ALTER TABLE keyword_lists ADD COLUMN focus TEXT")

    // Update existing built-in frameworks with their focus
    console.log('Updating existing frameworks with focus...')
    database.exec("UPDATE keyword_lists SET focus = 'sustainability' WHERE framework IN ('tcfd', 'gri', 'sdgs', 'sasb') AND is_builtin = 1")
  }
}

/**
 * Migrate existing document-project relationships from the old project_id column
 * to the new project_documents junction table (many-to-many).
 * This allows documents to belong to multiple projects.
 */
function migrateProjectDocuments(database: Database.Database) {
  // Check if migration is needed (are there documents with project_id not yet in junction table?)
  const unmigrated = database.prepare(`
    SELECT d.id as document_id, d.project_id
    FROM documents d
    WHERE d.project_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM project_documents pd
      WHERE pd.document_id = d.id AND pd.project_id = d.project_id
    )
  `).all() as Array<{ document_id: string; project_id: string }>

  if (unmigrated.length > 0) {
    console.log(`Migrating ${unmigrated.length} document-project relationships to junction table...`)

    const insertRelation = database.prepare(`
      INSERT OR IGNORE INTO project_documents (project_id, document_id) VALUES (?, ?)
    `)

    const migrate = database.transaction((relations: typeof unmigrated) => {
      for (const rel of relations) {
        insertRelation.run(rel.project_id, rel.document_id)
      }
    })

    migrate(unmigrated)
    console.log('Migration complete.')
  }
}

function seedDefaultData(database: Database.Database) {
  // Check if countries are already seeded
  const countryCount = database.prepare('SELECT COUNT(*) as count FROM countries').get() as { count: number }
  
  if (countryCount.count === 0) {
    console.log('Seeding default countries...')
    const insertCountry = database.prepare('INSERT INTO countries (code, name, is_default) VALUES (?, ?, 1)')
    const insertMany = database.transaction((countries: typeof DEFAULT_COUNTRIES) => {
      for (const country of countries) {
        insertCountry.run(country.code, country.name)
      }
    })
    insertMany(DEFAULT_COUNTRIES)
  }

  // Check if industries are already seeded
  const industryCount = database.prepare('SELECT COUNT(*) as count FROM industries').get() as { count: number }
  
  if (industryCount.count === 0) {
    console.log('Seeding default industries...')
    const insertIndustry = database.prepare('INSERT INTO industries (id, name, category, is_default) VALUES (?, ?, ?, 1)')
    const insertMany = database.transaction((industries: typeof DEFAULT_INDUSTRIES) => {
      for (const industry of industries) {
        insertIndustry.run(industry.id, industry.name, industry.category)
      }
    })
    insertMany(DEFAULT_INDUSTRIES)
  }

  // Seed default settings
  const settingsCount = database.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number }
  
  if (settingsCount.count === 0) {
    console.log('Seeding default settings...')
    const insertSetting = database.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
    insertSetting.run('backend_url', BACKEND_URL)
    insertSetting.run('theme', 'system')
  }

  // Seed framework keyword lists
  const keywordListCount = database.prepare('SELECT COUNT(*) as count FROM keyword_lists WHERE is_builtin = 1').get() as { count: number }

  if (keywordListCount.count === 0) {
    console.log('Seeding framework keyword lists...')
    const insertKeywordList = database.prepare(
      `INSERT INTO keyword_lists (id, name, description, framework, focus, list_type, keywords, is_builtin)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    )
    const insertMany = database.transaction((frameworks: typeof FRAMEWORK_KEYWORDS) => {
      for (const framework of frameworks) {
        const id = `builtin-${framework.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        insertKeywordList.run(
          id,
          framework.name,
          framework.description,
          framework.id,
          framework.focus,
          framework.list_type,
          JSON.stringify(framework.keywords)
        )
        console.log(`  Seeded: ${framework.name} (${framework.focus})`)
      }
    })
    insertMany(FRAMEWORK_KEYWORDS)
    console.log(`Seeded ${FRAMEWORK_KEYWORDS.length} framework keyword lists`)
  } else {
    // Check if we need to add new frameworks (e.g., after adding new themes)
    const existingFrameworks = database.prepare('SELECT framework FROM keyword_lists WHERE is_builtin = 1').all() as { framework: string }[]
    const existingIds = new Set(existingFrameworks.map(f => f.framework))
    const newFrameworks = FRAMEWORK_KEYWORDS.filter(f => !existingIds.has(f.id))

    if (newFrameworks.length > 0) {
      console.log(`Adding ${newFrameworks.length} new framework keyword lists...`)
      const insertKeywordList = database.prepare(
        `INSERT INTO keyword_lists (id, name, description, framework, focus, list_type, keywords, is_builtin)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      )
      const insertMany = database.transaction((frameworks: typeof FRAMEWORK_KEYWORDS) => {
        for (const framework of frameworks) {
          const id = `builtin-${framework.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          insertKeywordList.run(
            id,
            framework.name,
            framework.description,
            framework.id,
            framework.focus,
            framework.list_type,
            JSON.stringify(framework.keywords)
          )
          console.log(`  Added: ${framework.name} (${framework.focus})`)
        }
      })
      insertMany(newFrameworks)
    } else {
      console.log(`Framework keyword lists already seeded (${keywordListCount.count} found)`)
    }
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
