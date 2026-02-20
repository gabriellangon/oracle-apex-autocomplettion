# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Trailing closing parentheses style for cleaner function call formatting

### Changed
- Improved nested multiline function call indentation

## [1.1.0] - 2026-02-20

### Added
- PL/SQL code formatter with automatic indentation
- Smart SQL clause alignment (FROM, WHERE, AND, etc.)
- Support for nested function call formatting
- Inline END IF/LOOP/CASE splitting for better readability

### Changed
- Improved handling of CASE/WHEN/ELSE blocks
- Better EXCEPTION block indentation
- Enhanced sub-SELECT alignment within parentheses

### Fixed
- Fixed alignment issues with inline END clauses
- Fixed indentation for deeply nested blocks

## [1.0.0] - 2026-02-18

### Added
- Initial release
- SQL keyword autocomplete
- PL/SQL keyword autocomplete
- Oracle APEX API autocomplete (500+ APIs)
  - APEX_UTIL
  - APEX_PAGE
  - APEX_APPLICATION
  - APEX_COLLECTION
  - APEX_MAIL
  - APEX_JSON
  - APEX_WEB_SERVICE
  - APEX_DEBUG
  - And more...
- Language switching popup (SQL/PL/SQL modes)
- Variable detection in code
- Monaco editor integration
- Extension popup UI

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 1.1.0 | 2026-02-20 | PL/SQL formatter, code indentation |
| 1.0.0 | 2026-02-18 | Initial release with autocomplete |

[Unreleased]: https://github.com/gabriellangon/apex-autocomplete/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/gabriellangon/apex-autocomplete/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/gabriellangon/apex-autocomplete/releases/tag/v1.0.0
