# ATF Form 5320.23 Generator

A client-side web application for generating PDFs of ATF Form 5320.23 (National Firearms Act Responsible Person Questionnaire). This tool processes forms entirely in your browser using WebAssembly - no data is sent to external servers.

## 🔗 Live Application

Access the form generator at: **https://jakepro716.github.io/atf-5320-generator/**

## Features

- **Complete client-side processing** - Your data never leaves your browser
- **Auto-save functionality** - Form state is saved in browser storage (sessionStorage by default, opt-in localStorage)
- **PDF generation** - Creates properly formatted ATF Form 5320.23 PDFs with separate ATF/RP and CLEO copies packaged as a ZIP
- **Signature pad** - Draw your signature with a guided baseline; rendered with transparent background onto the PDF
- **Photo upload** - Attach a passport-style photo that gets embedded into the form
- **Batch processing** - Import a CSV of multiple items to generate forms in bulk as a single ZIP
- **Form validation** - Real-time validation with inline error messages
- **Smart field interactions** - Auto-formatting for phone numbers, SSNs, and conditional field enabling

## Building

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Type checking
npm run type-check
```

## Development

The project uses:

- **TypeScript** with strict configuration
- **Webpack** for bundling with WebAssembly support
- **mupdf.js** for client-side PDF manipulation
- **JSZip** for packaging ATF and CLEO PDF copies
- **autopen** for signature stroke rendering
### Project Structure

- `src/index.ts` - PDF generation, signature rendering, photo embedding, and batch processing
- `index.html` - Form markup and Content Security Policy
- `static/form.js` - Form state management, validation, signature pad UI, and serialization
- `static/styles.css` - Application styles
- `static/` - Also contains the official ATF form PDF template

## Privacy & Security

- All form processing happens locally in your browser
- No form data is transmitted to external servers
- Restrictive Content Security Policy implemented
- Open source under AGPL-3.0-or-later license

## Acknowledgements

This project is based on the original [atf-5320.23-generator](https://github.com/schlarpc/atf-5320.23-generator) by [schlarpc](https://github.com/schlarpc).

## License

This project is licensed under the AGPL-3.0-or-later license. See the LICENSE file for details.
