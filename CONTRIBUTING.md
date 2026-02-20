# Contributing to APEX Autocomplete

First off, thank you for considering contributing to APEX Autocomplete! It's people like you that make this extension better for everyone.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**When reporting a bug, include:**

- Your Chrome version
- Your Oracle APEX version
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots if applicable
- Any error messages from the browser console

**Bug Report Template:**

```markdown
## Bug Description
A clear description of the bug.

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. Type '...'
4. See error

## Expected Behavior
What you expected to happen.

## Actual Behavior
What actually happened.

## Environment
- Chrome Version:
- APEX Version:
- Extension Version:

## Screenshots
If applicable, add screenshots.

## Console Errors
Any errors from the browser console (F12 > Console).
```

### Suggesting Features

Feature requests are welcome! Please provide:

- A clear description of the feature
- Why it would be useful
- Examples of how it would work

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes**
4. **Add tests** for any new functionality
5. **Run the test suite**: `npm test`
6. **Ensure all tests pass**
7. **Submit your PR**

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/apex-autocomplete.git
cd apex-autocomplete

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode (during development)
npm run test:watch
```

### Loading the Extension Locally

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the project folder

### Project Structure

```
apex-autocomplete/
├── manifest.json           # Extension manifest
├── content-script.js       # Bridge between extension and page
├── injected.js            # Main logic injected into APEX pages
├── completion-provider.js  # Monaco autocomplete provider
├── plsql-indenter.js      # PL/SQL formatter
├── formatter.js           # Formatting integration
├── tests/                 # Test files
└── dictionaries/          # Keyword dictionaries
```

## Coding Guidelines

### JavaScript Style

- Use `var` for compatibility (no ES6 modules in content scripts)
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and small

### Testing

- Write tests for all new functionality
- Tests should be in `tests/` with `.test.js` suffix
- Use descriptive test names

**Example test:**

```javascript
test('formats IF/THEN block correctly', () => {
  var code = 'IF x > 0 THEN y := 1; END IF;';
  var result = format(code);
  expect(result).toContain('IF x > 0 THEN');
  expect(result).toContain('END IF;');
});
```

### Commit Messages

Use clear, descriptive commit messages:

```
feat: Add support for APEX_EXPORT API
fix: Correct indentation for nested CASE statements
docs: Update README with new features
test: Add tests for formatter edge cases
refactor: Simplify tokenizer logic
```

**Prefixes:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `test:` - Adding/updating tests
- `refactor:` - Code refactoring
- `style:` - Code style changes (formatting)
- `chore:` - Maintenance tasks

## Adding New APEX APIs

To add new Oracle APEX APIs to the autocomplete:

1. Edit `dictionaries/apex-api.json`
2. Follow the existing format:

```json
{
  "label": "APEX_NEW_PACKAGE.FUNCTION_NAME",
  "kind": "Function",
  "detail": "Brief description",
  "documentation": "Detailed documentation with parameters",
  "insertText": "APEX_NEW_PACKAGE.FUNCTION_NAME(${1:param1}, ${2:param2})"
}
```

3. Add tests if the API requires special handling

## Release Process

For maintainers:

1. Update version in `manifest.json` and `package.json`
2. Update `CHANGELOG.md`
3. Run tests: `npm test`
4. Build: `./build.sh`
5. Create git tag: `git tag -a v1.x.x -m "Release v1.x.x"`
6. Push: `git push origin main --tags`
7. Upload ZIP to Chrome Web Store

## Questions?

Feel free to open an issue with the `question` label or start a discussion.

Thank you for contributing!
