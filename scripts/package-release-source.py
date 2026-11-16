"""Package the committed source and the generated Android inputs used for a release.

Usage: python scripts/package-release-source.py v1.2.26
Run after the matching Android release build, from the repository root.
"""
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import zipfile

root = pathlib.Path.cwd()
ref = sys.argv[1] if len(sys.argv) > 1 else 'HEAD'
commit = subprocess.check_output(['git', 'rev-parse', ref + '^{commit}'], text=True).strip()
archive = subprocess.check_output(['git', 'archive', '--format=zip', commit])
with zipfile.ZipFile(io.BytesIO(archive)) as source:
    files = {name: source.read(name) for name in source.namelist() if not name.endswith('/')}
config = json.loads(files['app.json'])['expo']
version = config['version']
for name in ('build.gradle', 'settings.gradle', 'gradle.properties', 'gradlew', 'gradlew.bat',
             'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties',
             'app/build.gradle', 'app/proguard-rules.pro'):
    files['android/' + name] = (root / 'android' / name).read_bytes()
for file in (root / 'android/app/src').rglob('*'):
    if file.is_file():
        files[file.relative_to(root).as_posix()] = file.read_bytes()
gradle = files['android/app/build.gradle'].decode('utf-8')
assert f'versionName "{version}"' in gradle
assert f'versionCode {config["android"]["versionCode"]}' in gradle
for name in files:
    parts = pathlib.PurePosixPath(name).parts
    assert not any(p in ('.git', '.tools', 'node_modules', 'build', '.cxx') for p in parts), name
    assert pathlib.PurePosixPath(name).suffix.lower() not in ('.jks', '.keystore', '.pass', '.pem', '.p12', '.pfx'), name
    assert pathlib.PurePosixPath(name).name not in ('local.properties', 'credentials.json', '.env'), name
manifest = {
    'version': version, 'versionCode': config['android']['versionCode'], 'commit': commit,
    'tag': 'v' + version,
    'repository': 'https://github.com/vipt/ikenie-shogi-source',
    'generatedAndroidIncluded': True,
    'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())},
}
files['SOURCE-MANIFEST.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
out = root / 'artifacts' / f'ikenie-shogi-{version}-source.zip'
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
    for name, data in sorted(files.items()):
        info = zipfile.ZipInfo(name, (2026, 11, 16, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (0o100755 if name.endswith('/gradlew') else 0o100644) << 16
        target.writestr(info, data)
with zipfile.ZipFile(out) as check:
    assert check.testzip() is None
print(json.dumps({'source': str(out), 'files': len(files), 'bytes': out.stat().st_size,
                  'commit': commit, 'sha256': hashlib.sha256(out.read_bytes()).hexdigest()}))
