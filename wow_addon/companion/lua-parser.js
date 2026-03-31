// ================================================
// LUA SAVEDVARIABLES PARSER
// Recursive-descent parser for WoW SavedVariables format.
// No eval. Handles tables, strings, numbers, booleans, nil, comments.
// ================================================
'use strict';

const fs = require('fs');

class LuaParser {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.len = source.length;
  }

  // ── Helpers ──

  peek() {
    return this.pos < this.len ? this.source[this.pos] : null;
  }

  advance() {
    return this.source[this.pos++];
  }

  expect(ch) {
    if (this.peek() !== ch) {
      throw new Error(`Expected '${ch}' at position ${this.pos}, got '${this.peek()}'`);
    }
    this.advance();
  }

  skipWhitespaceAndComments() {
    while (this.pos < this.len) {
      const ch = this.source[this.pos];

      // Whitespace
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.pos++;
        continue;
      }

      // Comments
      if (ch === '-' && this.pos + 1 < this.len && this.source[this.pos + 1] === '-') {
        this.pos += 2;
        // Block comment: --[[ ... ]]
        if (this.pos + 1 < this.len && this.source[this.pos] === '[' && this.source[this.pos + 1] === '[') {
          this.pos += 2;
          while (this.pos + 1 < this.len) {
            if (this.source[this.pos] === ']' && this.source[this.pos + 1] === ']') {
              this.pos += 2;
              break;
            }
            this.pos++;
          }
        } else {
          // Line comment: skip to end of line
          while (this.pos < this.len && this.source[this.pos] !== '\n') {
            this.pos++;
          }
        }
        continue;
      }

      break;
    }
  }

  // ── Top-level: parse global variable assignments ──
  // Format: VARNAME = { ... }

  parseAssignments() {
    const result = new Map();

    while (this.pos < this.len) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.len) break;

      // Read identifier
      const identStart = this.pos;
      while (this.pos < this.len && /[A-Za-z0-9_]/.test(this.source[this.pos])) {
        this.pos++;
      }
      const ident = this.source.substring(identStart, this.pos);
      if (!ident) break;

      this.skipWhitespaceAndComments();
      if (this.peek() !== '=') break;
      this.advance(); // consume '='
      this.skipWhitespaceAndComments();

      const value = this.parseValue();
      result.set(ident, value);

      this.skipWhitespaceAndComments();
    }

    return result;
  }

  // ── Value parsing ──

  parseValue() {
    this.skipWhitespaceAndComments();
    const ch = this.peek();

    if (ch === '{') return this.parseTable();
    if (ch === '"' || ch === "'") return this.parseString();
    if (ch === '-' || (ch >= '0' && ch <= '9')) return this.parseNumber();

    // Bare words: true, false, nil, or identifier
    return this.parseBareWord();
  }

  parseString() {
    const quote = this.advance(); // consume opening quote
    let result = '';

    while (this.pos < this.len) {
      const ch = this.source[this.pos];

      if (ch === quote) {
        this.advance(); // consume closing quote
        return result;
      }

      if (ch === '\\') {
        this.advance();
        const escaped = this.source[this.pos];
        this.advance();

        switch (escaped) {
          case 'n':  result += '\n'; break;
          case 't':  result += '\t'; break;
          case 'r':  result += '\r'; break;
          case '\\': result += '\\'; break;
          case '"':  result += '"';  break;
          case "'":  result += "'";  break;
          default:
            // Numeric escape: \123
            if (escaped >= '0' && escaped <= '9') {
              let numStr = escaped;
              for (let i = 0; i < 2 && this.pos < this.len; i++) {
                const next = this.source[this.pos];
                if (next >= '0' && next <= '9') {
                  numStr += next;
                  this.pos++;
                } else break;
              }
              result += String.fromCharCode(parseInt(numStr, 10));
            } else {
              result += escaped;
            }
        }
        continue;
      }

      result += ch;
      this.advance();
    }

    return result;
  }

  parseNumber() {
    const start = this.pos;

    if (this.peek() === '-') this.advance();

    // Hex: 0x...
    if (this.peek() === '0' && this.pos + 1 < this.len &&
        (this.source[this.pos + 1] === 'x' || this.source[this.pos + 1] === 'X')) {
      this.pos += 2;
      while (this.pos < this.len && /[0-9a-fA-F]/.test(this.source[this.pos])) {
        this.pos++;
      }
      return parseInt(this.source.substring(start, this.pos), 16);
    }

    // Decimal digits
    while (this.pos < this.len && this.source[this.pos] >= '0' && this.source[this.pos] <= '9') {
      this.pos++;
    }

    // Decimal point
    if (this.peek() === '.') {
      this.advance();
      while (this.pos < this.len && this.source[this.pos] >= '0' && this.source[this.pos] <= '9') {
        this.pos++;
      }
    }

    // Exponent
    if (this.peek() === 'e' || this.peek() === 'E') {
      this.advance();
      if (this.peek() === '+' || this.peek() === '-') this.advance();
      while (this.pos < this.len && this.source[this.pos] >= '0' && this.source[this.pos] <= '9') {
        this.pos++;
      }
    }

    const numStr = this.source.substring(start, this.pos);
    const num = Number(numStr);
    return Number.isFinite(num) ? num : 0;
  }

  parseBareWord() {
    const start = this.pos;
    while (this.pos < this.len && /[A-Za-z0-9_]/.test(this.source[this.pos])) {
      this.pos++;
    }
    const word = this.source.substring(start, this.pos);

    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'nil') return null;

    return word || null;
  }

  parseTable() {
    this.expect('{');
    this.skipWhitespaceAndComments();

    // Determine if this is an array-like table or a hash table
    // by looking at the first entry
    const entries = [];
    let isArray = null; // will be determined on first entry
    let arrayIndex = 1; // Lua arrays are 1-based

    while (this.pos < this.len) {
      this.skipWhitespaceAndComments();

      if (this.peek() === '}') {
        this.advance();
        break;
      }

      // Check for keyed entry: ["key"] = value  OR  [number] = value  OR  key = value
      const saved = this.pos;
      let key = null;
      let isKeyed = false;

      if (this.peek() === '[') {
        this.advance();
        this.skipWhitespaceAndComments();

        if (this.peek() === '"' || this.peek() === "'") {
          // String key: ["key"]
          key = this.parseString();
          this.skipWhitespaceAndComments();
          this.expect(']');
          this.skipWhitespaceAndComments();
          this.expect('=');
          isKeyed = true;
          if (isArray === null) isArray = false;
        } else {
          // Numeric key: [1]
          key = this.parseNumber();
          this.skipWhitespaceAndComments();
          this.expect(']');
          this.skipWhitespaceAndComments();
          this.expect('=');
          isKeyed = true;
          if (isArray === null) isArray = true;
        }
      } else if (/[A-Za-z_]/.test(this.peek())) {
        // Bare identifier key: key = value
        const identStart = this.pos;
        while (this.pos < this.len && /[A-Za-z0-9_]/.test(this.source[this.pos])) {
          this.pos++;
        }
        const ident = this.source.substring(identStart, this.pos);
        this.skipWhitespaceAndComments();

        if (this.peek() === '=') {
          // It's a key
          this.advance();
          key = ident;
          isKeyed = true;
          if (isArray === null) isArray = false;
        } else {
          // Not a key — it's a bare value (true/false/nil/identifier)
          this.pos = saved;
          if (isArray === null) isArray = true;
        }
      } else {
        // Direct value (e.g., string or number in an array)
        if (isArray === null) isArray = true;
      }

      this.skipWhitespaceAndComments();
      const value = this.parseValue();

      if (isKeyed) {
        entries.push({ key, value });
      } else {
        entries.push({ key: arrayIndex++, value });
      }

      // Consume optional comma or semicolon
      this.skipWhitespaceAndComments();
      if (this.peek() === ',' || this.peek() === ';') {
        this.advance();
      }
    }

    // Build result
    if (isArray && entries.length > 0 && entries.every((e) => typeof e.key === 'number')) {
      // Detect base index: Lua arrays are normally 1-based, but WoW sometimes
      // uses 0-based (e.g., rankNames where [0] = "Guild Master").
      const minKey = Math.min(...entries.map((e) => e.key));
      const offset = minKey === 0 ? 0 : 1; // 0-based → no shift, 1-based → shift down by 1
      const arr = [];
      for (const entry of entries) {
        arr[entry.key - offset] = entry.value;
      }
      return arr;
    }

    // Return as JS object
    const obj = {};
    for (const entry of entries) {
      obj[entry.key] = entry.value;
    }
    return obj;
  }
}

// ── Public API ──

function parseLuaString(source) {
  const parser = new LuaParser(source);
  const assignments = parser.parseAssignments();
  return Object.fromEntries(assignments);
}

function parseLuaFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return parseLuaString(source);
}

module.exports = { parseLuaString, parseLuaFile };
