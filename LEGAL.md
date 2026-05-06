# Legal Notices and Acknowledgements

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Open Source Acknowledgements

CiteSight is built with and depends on numerous open-source projects. We gratefully acknowledge the contributions of the following projects and their maintainers:

### Frontend Dependencies

#### Core Framework
- **[React](https://reactjs.org/)** - MIT License
  - Copyright (c) Meta Platforms, Inc. and affiliates
  - A JavaScript library for building user interfaces

- **[TypeScript](https://www.typescriptlang.org/)** - Apache License 2.0
  - Copyright (c) Microsoft Corporation
  - JavaScript with syntax for types

- **[Vite](https://vitejs.dev/)** - MIT License
  - Copyright (c) 2019-present Evan You & Vite Contributors
  - Next generation frontend tooling

#### State Management & Routing
- **[Zustand](https://github.com/pmndrs/zustand)** - MIT License
  - Copyright (c) 2019 Paul Henschel
  - Bear necessities for state management in React

#### UI Components & Visualization
- **[React Dropzone](https://react-dropzone.js.org/)** - MIT License
  - Copyright (c) 2014 Param Aggarwal
  - Simple HTML5 drag-drop zone with React.js

- **[Recharts](https://recharts.org/)** - MIT License
  - Copyright (c) 2015-present recharts
  - Redefined chart library built with React and D3

- **[React Tabs](https://github.com/reactjs/react-tabs)** - MIT License
  - Copyright (c) 2015 Matt Zabriskie
  - Accessible and easy tab component for ReactJS

#### HTTP & API
- **[Axios](https://axios-http.com/)** - MIT License
  - Copyright (c) 2014-present Matt Zabriskie
  - Promise based HTTP client for the browser and node.js

### Backend Dependencies

#### Core Framework
- **[FastAPI](https://fastapi.tiangolo.com/)** - MIT License
  - Copyright (c) 2018 Sebastián Ramírez
  - Modern, fast web framework for building APIs with Python

- **[Uvicorn](https://www.uvicorn.org/)** - BSD 3-Clause License
  - Copyright (c) 2017-present, Tom Christie
  - Lightning-fast ASGI server implementation

- **[Pydantic](https://pydantic-docs.helpmanual.io/)** - MIT License
  - Copyright (c) 2017 Samuel Colvin
  - Data validation using Python type annotations

#### Document Processing
- **[PyPDF2](https://pypdf2.readthedocs.io/)** - BSD 3-Clause License
  - Copyright (c) 2006-2008, Mathieu Fenniak
  - Pure-python PDF library

- **[pdfplumber](https://github.com/jsvine/pdfplumber)** - MIT License
  - Copyright (c) 2019 Jeremy Singer-Vine
  - Plumb a PDF for detailed information about its text

- **[python-docx](https://python-docx.readthedocs.io/)** - MIT License
  - Copyright (c) 2013 Steve Canny
  - Create and modify Word documents with Python

- **[python-pptx](https://python-pptx.readthedocs.io/)** - MIT License
  - Copyright (c) 2013 Steve Canny
  - Generate and manipulate PowerPoint documents with Python

#### Text Analysis
- **[textstat](https://github.com/shivam5992/textstat)** - MIT License
  - Copyright (c) 2016 Shivam Bansal, Chaitanya Aggarwal
  - Python package to calculate readability statistics

- **[NLTK](https://www.nltk.org/)** - Apache License 2.0
  - Copyright (c) 2001-2023 NLTK Project
  - Natural Language Toolkit

- **[scikit-learn](https://scikit-learn.org/)** - BSD 3-Clause License
  - Copyright (c) 2007-2024 The scikit-learn developers
  - Machine Learning in Python

#### Security & Rate Limiting
- **[SlowAPI](https://github.com/laurentS/slowapi)** - MIT License
  - Copyright (c) 2020 Laurent Savaete
  - Rate limiter for FastAPI

- **[python-jose](https://github.com/mpdavis/python-jose)** - MIT License
  - Copyright (c) 2015 Michael Davis
  - JavaScript Object Signing and Encryption for Python

- **[passlib](https://passlib.readthedocs.io/)** - BSD 2-Clause License
  - Copyright (c) 2008-2020 Eli Collins
  - Comprehensive password hashing framework

#### HTTP Clients
- **[httpx](https://www.python-httpx.org/)** - BSD 3-Clause License
  - Copyright (c) 2019-present Tom Christie
  - Fully featured HTTP client for Python 3

- **[requests](https://requests.readthedocs.io/)** - Apache License 2.0
  - Copyright (c) 2019 Kenneth Reitz
  - Simple, yet elegant HTTP library

## External Services Acknowledgements

CiteSight integrates with several external services to provide comprehensive document analysis:

### Wayback Machine / Internet Archive
- **[Internet Archive Wayback Machine](https://archive.org/web/)**
  - Non-profit digital library offering free public access to digitized materials
  - Used for retrieving archived versions of broken URLs
  - Terms of Use: https://archive.org/about/terms.php
  - Privacy Policy: https://archive.org/about/privacy.php

### CrossRef
- **[CrossRef API](https://www.crossref.org/)**
  - Official Digital Object Identifier (DOI) Registration Agency
  - Used for DOI resolution and metadata retrieval
  - API Documentation: https://api.crossref.org/
  - Terms: https://www.crossref.org/terms/

## Data Privacy Notice

CiteSight is designed with privacy as a core principle:
- All document processing occurs in memory only
- No user documents or content are permanently stored
- No data is shared with third parties except for:
  - URL verification (only URLs are sent, not document content)
  - DOI resolution (only DOI strings are sent to CrossRef)
  - Wayback Machine queries (only broken URLs are checked)

## Compliance

This software is provided for legitimate academic and educational purposes. Users are responsible for:
- Ensuring they have the right to analyze any documents they upload
- Compliance with their institution's academic integrity policies
- Proper use of citation verification features

## Attribution Requirements

If you use CiteSight in your research or academic work, we appreciate attribution:

```
CiteSight - Academic Document Analyzer
https://github.com/michael-borck/cite-sight
```

## Third-Party Licenses

All third-party licenses can be found in their respective package directories:
- Frontend: `frontend/node_modules/[package]/LICENSE`
- Backend: Check individual package licenses via `pip show [package]`

## Trademark Notice

All trademarks, service marks, trade names, product names, and logos appearing in this software are the property of their respective owners. Use of any trade name or trademark is for identification and reference purposes only and does not imply any association with the trademark holder.

## Contact

For questions about licensing or attribution, please open an issue on our GitHub repository:
https://github.com/michael-borck/cite-sight/issues

---

*Last updated: August 2024*