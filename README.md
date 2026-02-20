# APEX Autocomplete - SQL/PL/SQL IntelliSense

[![Tests](https://github.com/gabriellangon/apex-autocomplete/actions/workflows/test.yml/badge.svg)](https://github.com/gabriellangon/apex-autocomplete/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-green.svg)](https://chrome.google.com/webstore)

> Powerful SQL, PL/SQL, and Oracle APEX API autocomplete for Oracle APEX Monaco editors.

![APEX Autocomplete Demo](docs/demo.gif)

## Features

- **SQL Autocomplete** - Complete SQL keywords, clauses, and syntax as you type
- **PL/SQL Autocomplete** - Smart completion for PL/SQL keywords, built-in functions, and procedural constructs
- **Oracle APEX API Autocomplete** - Full support for 500+ APEX PL/SQL APIs:
  - `APEX_UTIL`, `APEX_PAGE`, `APEX_APPLICATION`
  - `APEX_COLLECTION`, `APEX_MAIL`, `APEX_JSON`
  - `APEX_WEB_SERVICE`, `APEX_DEBUG`, and more...
- **Smart Code Formatting** - Automatic PL/SQL indentation and formatting
- **Language Switching** - Easily switch between SQL and PL/SQL modes
- **Variable Detection** - Recognizes declared variables in your code

## Installation

### From Chrome Web Store (Recommended)

1. Visit the [Chrome Web Store page](#) *(link coming soon)*
2. Click "Add to Chrome"
3. Navigate to any Oracle APEX page with a code editor

### From Source (Development)

```bash
# Clone the repository
git clone https://github.com/gabriellangon/apex-autocomplete.git
cd apex-autocomplete

# Install dependencies
npm install

# Run tests
npm test
```

Then load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder

## Usage

1. Navigate to any Oracle APEX page with a Monaco code editor
2. Start typing - autocomplete suggestions appear automatically
3. Press `Tab` or `Enter` to accept a suggestion
4. Click the extension icon to switch languages or access settings

## Project Structure

```
apex-autocomplete/
├── extension/              # Chrome extension source code
│   ├── manifest.json
│   ├── content-script.js
│   ├── injected.js
│   ├── completion-provider.js
│   ├── plsql-indenter.js
│   ├── formatter.js
│   ├── language-switcher.js
│   ├── popup.html/css/js
│   ├── parsers/
│   ├── dictionaries/
│   └── icons/
├── tests/                  # Jest test suite
├── docs/                   # Documentation
├── README.md
├── LICENSE
├── CHANGELOG.md
└── CONTRIBUTING.md
```

## Development

### Prerequisites

- Node.js 18+
- npm

### Running Tests

```bash
npm test
npm run test:watch  # Watch mode
```

### Building for Chrome Web Store

```bash
cd extension
zip -r ../apex-autocomplete.zip . -x "*.DS_Store"
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

## Privacy

This extension runs entirely in your browser. **No data is collected or sent to external servers.**

See our [Privacy Policy](PRIVACY.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- **Bug Reports**: [GitHub Issues](https://github.com/gabriellangon/apex-autocomplete/issues)
- **Questions**: Open an issue with the `question` label

---

Made for Oracle APEX developers
