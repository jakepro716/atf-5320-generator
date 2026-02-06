# ATF Form 5320.23 Generator

A client-side web application for generating PDFs of ATF Form 5320.23 (National Firearms Act Responsible Person Questionnaire). This tool processes forms entirely in your browser using WebAssembly - no data is sent to external servers.

## 🔗 Live Application

Access the form generator at: **https://schlarpc.github.io/atf-5320.23-generator/**

## Features

- **Complete client-side processing** - Your data never leaves your browser
- **Auto-save functionality** - Form state is preserved in the URL for bookmarking
- **PDF generation** - Creates properly formatted ATF Form 5320.23 PDFs
- **Form validation** - Real-time validation with inline error messages
- **Smart field interactions** - Auto-formatting for phone numbers, SSNs, and conditional field enabling

## Building

### With Nix (Recommended)

```bash
# Build the project
nix build

# Development environment with direnv
direnv allow  # enables automatic nix develop shell
npm run dev   # starts development server on port 2000
```

### With Node.js/npm

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
- **Nix** for reproducible builds and deployment

### Project Structure

- `src/index.ts` - Main TypeScript application with PDF generation logic
- `index.html` - Complete form implementation with embedded styles
- `static/` - Contains the official ATF form PDF template
- `flake.nix` - Nix build configuration for reproducible builds

## Privacy & Security

- All form processing happens locally in your browser
- No form data is transmitted to external servers
- Restrictive Content Security Policy implemented
- Open source under AGPL-3.0-or-later license

## License

This project is licensed under the AGPL-3.0-or-later license. See the LICENSE file for details.
