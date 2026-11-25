#!/usr/bin/env python3
r"""Build ASCII-safe push_files payloads for doctor-appointment-bd.

Reads the build files, emits one JSON file per chunk under /tmp/dabd-push/
with ensure_ascii=True (Bengali -> unicode escapes), each under 90KB.
Prints the file list, per-chunk sizes, and the github push command template.
Does NOT push anything itself. Binary smoke screenshots are local-only
evidence (the push API cannot carry binaries) and are NOT included.

NOTE: chunks a/b were pushed 2026-11-25 with "factory run #441" in their
commit messages and chunk-c with #445 (the number at each push time); the
ledger number is #447. Re-running this script regenerates a/b payloads
with #447 messages — do NOT re-push a/b. Chunk-c was built by
/tmp/dabd-push/make_chunk_c.py and chunk-d by /tmp/dabd-push/make_chunk_d.py,
not by this script.
"""
import json, os

BUILD = os.path.expanduser('~/workspace/muse-project-factory/builds/doctor-appointment-bd')
OUT = '/tmp/dabd-push'
FILES = [
    'index.html',
    'css/style.css',
    'js/data.js',
    'js/logic.js',
    'js/app.js',
    'tests/test.js',
    'tests/smoke.mjs',
    'README.md',
    'TEST_RESULTS.md',
    '.gitignore',
]

def read(p):
    with open(os.path.join(BUILD, p), 'r', encoding='utf-8') as f:
        return f.read()

def main():
    os.makedirs(OUT, exist_ok=True)
    entries = []
    for p in FILES:
        content = read(p)
        entries.append({'path': p, 'content': content})
        print(f'{p}: {len(content.encode("utf-8"))} bytes utf-8, '
              f'{len(json.dumps(content, ensure_ascii=True)) - 2} bytes ascii-escaped content')

    # Chunking: greedily pack entries so each push JSON stays under ~90KB.
    chunks = []
    cur, cur_size = [], 0
    for e in entries:
        size = len(json.dumps(e, ensure_ascii=True))
        if cur and cur_size + size > 80000:
            chunks.append(cur)
            cur, cur_size = [], 0
        cur.append(e)
        cur_size += size
    if cur:
        chunks.append(cur)

    for i, chunk_files in enumerate(chunks, 1):
        message = (f'doctor-appointment-bd factory run #447 '
                   f'({i}/{len(chunks)}): ' +
                   ', '.join(e['path'] for e in chunk_files))
        payload = {
            'owner': 'fahad3235',
            'repo': 'doctor-appointment-bd',
            'branch': 'main',
            'message': message,
            'files': chunk_files,
        }
        text = json.dumps(payload, ensure_ascii=True)
        name = f'chunk-{chr(96 + i)}'
        out_path = os.path.join(OUT, name + '.json')
        with open(out_path, 'w', encoding='ascii') as f:
            f.write(text)
        print(f'{name}: {len(text)} bytes -> {out_path} '
              f'({"OK" if len(text) < 90000 else "TOO BIG"})')
        assert all(ord(c) < 128 for c in text), 'non-ascii leaked into ' + name
        assert len(text) < 90000, name + ' exceeds 90KB'
    print('All payloads ASCII-safe.')
    print('Push with: github call-tool --name push_files --arguments-json "$(cat /tmp/dabd-push/chunk-a.json)"')

if __name__ == '__main__':
    main()
