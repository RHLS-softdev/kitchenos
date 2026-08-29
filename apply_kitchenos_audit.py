#!/usr/bin/env python3
# Simplified patch helper generated from the audit.
# Applies the mechanical changes and flags the files that require full replacement.

from pathlib import Path
import re, sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "kitchenos-backend")

def rw(rel):
    p = ROOT / rel
    return p.read_text(encoding="utf-8")

def ww(rel, txt):
    (ROOT / rel).write_text(txt, encoding="utf-8")
    print("updated", rel)

req = rw("requirements.txt")
for dep in ("Flask-Limiter==3.8.0", "sentry-sdk[flask]==2.19.0"):
    if dep not in req:
        req += "\n" + dep
ww("requirements.txt", req)

models = rw("app/models.py")
models = models.replace("(self.servings or 0) < 1",
                        "(self.servings if self.servings is not None else 4) < 1")
models = models.replace("(self.pax or 0) < 1",
                        "(self.pax if self.pax is not None else 1) < 1")
ww("app/models.py", models)

print("\nManual full-file replacements still required:")
print("  app/__init__.py")
print("  app/ai.py")
print("  app/crud.py")
print("  app/config.py")
print("  app/extensions.py")
print("  app/auth.py")
