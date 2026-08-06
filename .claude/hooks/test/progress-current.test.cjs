'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var pathToFileURL = require('url').pathToFileURL;

var ROOT = path.join(__dirname, '..', '..', '..');
var MODULE = path.join(ROOT, '.claude', 'hooks', 'progress-current.mjs');
var START = '<!-- AMATLAS:PROGRESS:START -->';
var END = '<!-- AMATLAS:PROGRESS:END -->';
var pass = 0, fail = 0;

function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  X ' + msg); }
}

function block(body, newline) {
  var nl = newline || '\n';
  return START + nl + body + nl + END;
}

(async function () {
  console.log('-- progress current parser --');
  var parser;
  try {
    parser = await import(pathToFileURL(MODULE).href + '?test=' + Date.now());
  } catch (error) {
    console.log('  X PC0 parser module must load: ' + error.message);
    process.exit(1);
  }

  ok(parser.MAX_CURRENT_CODE_UNITS === 5600 && parser.MAX_PROGRESS_FILE_BYTES === 64 * 1024,
    'PC1 parser owns explicit 5600 UTF-16 code-unit current and 64 KiB file limits');

  var opaque = [
    '- extra-note: keep this opaque',
    '- next: run the focused suite',
    '## Arbitrary heading',
    'Free-form text that is not a schema field.'
  ].join('\n');
  var valid = parser.parseProgressText('OUTSIDE-SECRET-BEFORE\n' + block(opaque) + '\nOUTSIDE-SECRET-AFTER\n');
  ok(valid.status === 'valid' && valid.current === opaque, 'PC2 valid current is returned verbatim while marker-external text is excluded');
  ok(valid.current.indexOf('OUTSIDE-SECRET') < 0, 'PC3 marker-external body never enters current');

  var reordered = '- constraint: none\n- verification: pending\n- goal: reordered\n- custom-field: accepted';
  var extra = parser.parseProgressText(block(reordered));
  ok(extra.status === 'valid' && extra.current === reordered, 'PC4 reordered and additional fields remain valid opaque current');

  var crlfCurrent = '- next: CRLF\r\n- custom: preserved';
  var crlf = parser.parseProgressText('\uFEFF' + block(crlfCurrent, '\r\n') + '\r\n');
  ok(crlf.status === 'valid' && crlf.current === crlfCurrent, 'PC5 BOM and CRLF markers parse without rewriting current line endings');

  var exact = parser.parseProgressText(block('😀'.repeat(2800)));
  ok(exact.status === 'valid' && exact.currentCodeUnits === 5600,
    'PC6 exactly 5600 UTF-16 code units, including astral pairs, are valid');
  var over = parser.parseProgressText(block('😀'.repeat(2800) + 'x'));
  ok(over.status === 'invalid' && over.current === undefined && over.currentCodeUnits === 5601 &&
    /5601 UTF-16 code units/.test(over.errors.join(' ')),
    'PC7 5601 UTF-16 code units are invalid, unreturned, and reported with the explicit unit');

  [
    ['short', 'LEGACY-SHORT'],
    ['long', Array.from({ length: 400 }, function (_, i) { return 'LEGACY-LINE-' + i; }).join('\n')],
    ['giant', 'LEGACY-GIANT-' + 'z'.repeat(20000)]
  ].forEach(function (entry, index) {
    var result = parser.parseProgressText(entry[1]);
    ok(result.status === 'legacy' && result.current === undefined && result.codeUnitCount === entry[1].length,
      'PC' + (8 + index) + ' ' + entry[0] + ' legacy reports UTF-16 metadata and exposes no current');
  });

  var invalidCases = [
    ['duplicate start', START + '\n' + START + '\nSECRET-DUP-START\n' + END],
    ['duplicate end', START + '\nSECRET-DUP-END\n' + END + '\n' + END],
    ['missing end', START + '\nSECRET-MISSING-END'],
    ['missing start', 'SECRET-MISSING-START\n' + END],
    ['wrong order', END + '\nSECRET-WRONG-ORDER\n' + START],
    ['empty', START + '\n' + END],
    ['whitespace empty', START + '\n \t\n' + END]
  ];
  invalidCases.forEach(function (entry, index) {
    var result = parser.parseProgressText(entry[1]);
    ok(result.status === 'invalid' && result.current === undefined && result.errors.length > 0,
      'PC' + (11 + index) + ' ' + entry[0] + ' markers are invalid and expose no body');
  });

  var inline = parser.parseProgressText('prefix ' + START + '\nbody\n' + END + ' suffix');
  ok(inline.status === 'legacy', 'PC18 markers must occupy their complete line');

  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-progress-parser-'));
  try {
    var missing = parser.readProgressFile(path.join(tmp, 'missing.md'));
    ok(missing.status === 'missing', 'PC19 ENOENT is classified as missing');

    var oversizedPath = path.join(tmp, 'oversized.md');
    var oversizedBody = block('OVERSIZED-SECRET') + 'x'.repeat(parser.MAX_PROGRESS_FILE_BYTES + 1);
    fs.writeFileSync(oversizedPath, oversizedBody);
    var oversized = parser.readProgressFile(oversizedPath, tmp);
    ok(oversized.status === 'oversized' && oversized.fileBytes === Buffer.byteLength(oversizedBody) &&
      oversized.maximumFileBytes === parser.MAX_PROGRESS_FILE_BYTES && oversized.current === undefined,
      'PC20 oversized ordinary files are rejected before parsing and expose no body');

    var directory = path.join(tmp, 'PROGRESS.md');
    fs.mkdirSync(directory);
    var nonRegular = parser.readProgressFile(directory, tmp);
    ok(nonRegular.status === 'non_regular' && nonRegular.fileType === 'directory' && nonRegular.current === undefined,
      'PC21 directory roots are non-regular and expose no body');

    var insideTarget = path.join(tmp, 'inside-target.md');
    var insideLink = path.join(tmp, 'inside-link.md');
    var outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-progress-outside-'));
    try {
      fs.writeFileSync(insideTarget, block('INSIDE-SYMLINK-SECRET'));
      fs.writeFileSync(path.join(outsideDir, 'outside.md'), block('OUTSIDE-SYMLINK-SECRET'));
      try {
        fs.symlinkSync(insideTarget, insideLink, 'file');
        fs.symlinkSync(path.join(outsideDir, 'outside.md'), path.join(tmp, 'outside-link.md'), 'file');
        var insideSymlink = parser.readProgressFile(insideLink, tmp);
        var outsideSymlink = parser.readProgressFile(path.join(tmp, 'outside-link.md'), tmp);
        ok(insideSymlink.status === 'non_regular' && insideSymlink.fileType === 'symlink' && insideSymlink.current === undefined,
          'PC22 in-tree symlinks remain non-regular and expose no target body');
        ok(outsideSymlink.status === 'tree_external' && outsideSymlink.current === undefined &&
          JSON.stringify(outsideSymlink).indexOf('OUTSIDE-SYMLINK-SECRET') < 0,
          'PC23 tree-external symlinks are classified without exposing target body');
      } catch (error) {
        if (!error || !/^(EPERM|EACCES|ENOSYS)$/.test(error.code || '')) throw error;
        if (process.platform !== 'win32') {
          console.log('  - PC22-PC23 symlink assertions skipped: ' + error.code);
        } else {
          var outsideJunction = path.join(tmp, 'outside-junction.md');
          fs.symlinkSync(outsideDir, outsideJunction, 'junction');
          var junctionResult = parser.readProgressFile(outsideJunction, tmp);
          ok(junctionResult.status === 'tree_external' && junctionResult.current === undefined,
            'PC23 tree-external Windows junctions are classified without reading targets');
        }
      }
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }

    var swapOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-progress-swap-outside-'));
    var swapPath = path.join(tmp, 'swap.md');
    var swapTarget = path.join(swapOutside, 'swap-target.md');
    fs.writeFileSync(swapPath, block('SAFE-BEFORE-SWAP'));
    fs.writeFileSync(swapTarget, block('SWAP-EXTERNAL-SECRET'));
    var originalOpen = fs.openSync;
    var swapAttempted = false;
    fs.openSync = function (file) {
      if (!swapAttempted && path.resolve(String(file)) === path.resolve(swapPath)) {
        swapAttempted = true;
        fs.unlinkSync(swapPath);
        try {
          fs.symlinkSync(swapTarget, swapPath, 'file');
        } catch (error) {
          if (!error || !/^(EPERM|EACCES|ENOSYS)$/.test(error.code || '') || process.platform !== 'win32') throw error;
          var swapDir = path.join(swapOutside, 'swap-dir');
          fs.mkdirSync(swapDir);
          fs.symlinkSync(swapDir, swapPath, 'junction');
        }
      }
      return originalOpen.apply(this, arguments);
    };
    try {
      var swapped = parser.readProgressFile(swapPath, tmp);
      ok(swapAttempted && swapped.status !== 'valid' && swapped.current === undefined &&
        JSON.stringify(swapped).indexOf('SWAP-EXTERNAL-SECRET') < 0,
        'PC24 pathname swap between validation and open cannot inject an external current');
    } finally {
      fs.openSync = originalOpen;
      fs.rmSync(swapOutside, { recursive: true, force: true });
    }

    var parentOriginal = path.join(tmp, 'parent-original');
    var parentPath = path.join(tmp, 'parent-active');
    var parentOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-progress-parent-outside-'));
    fs.mkdirSync(parentPath);
    fs.writeFileSync(path.join(parentPath, 'PROGRESS.md'), block('PARENT-SAFE-CURRENT'));
    fs.writeFileSync(path.join(parentOutside, 'PROGRESS.md'), block('PARENT-EXTERNAL-SECRET'));
    var parentOpen = fs.openSync;
    var parentSwapped = false;
    fs.openSync = function (file) {
      if (!parentSwapped && path.resolve(String(file)) === path.resolve(path.join(parentPath, 'PROGRESS.md'))) {
        parentSwapped = true;
        fs.renameSync(parentPath, parentOriginal);
        try {
          fs.symlinkSync(parentOutside, parentPath, 'dir');
        } catch (error) {
          if (!error || !/^(EPERM|EACCES|ENOSYS)$/.test(error.code || '') || process.platform !== 'win32') throw error;
          fs.symlinkSync(parentOutside, parentPath, 'junction');
        }
      }
      return parentOpen.apply(this, arguments);
    };
    try {
      var parentSwap = parser.readProgressFile(path.join(parentPath, 'PROGRESS.md'), tmp);
      ok(parentSwapped && parentSwap.status !== 'valid' && parentSwap.current === undefined &&
        JSON.stringify(parentSwap).indexOf('PARENT-EXTERNAL-SECRET') < 0,
        'PC25 parent-path replacement cannot bind recovery to a tree-external file');
    } finally {
      fs.openSync = parentOpen;
      fs.rmSync(parentPath, { recursive: true, force: true });
      fs.rmSync(parentOriginal, { recursive: true, force: true });
      fs.rmSync(parentOutside, { recursive: true, force: true });
    }

    if (process.platform !== 'win32') {
      var denied = path.join(tmp, 'denied.md');
      fs.writeFileSync(denied, block('SECRET-DENIED'));
      fs.chmodSync(denied, 0o000);
      var deniedResult = parser.readProgressFile(denied, tmp);
      fs.chmodSync(denied, 0o600);
      ok(deniedResult.status === 'unreadable' && deniedResult.code === 'EACCES', 'PC26 EACCES is unreadable when the platform enforces it');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('==== progress current parser: ' + pass + ' PASS / ' + fail + ' FAIL ====');
  process.exit(fail ? 1 : 0);
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
