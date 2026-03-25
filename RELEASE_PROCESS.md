# Boss Cube Web Control - Release Process

**Versioned deployment via GitHub Actions + git tags**

---

## 📋 **Version Format**

**Development:** `2.27.0-alpha.1`, `2.27.0-alpha.2`, etc.  
**Stable:** `2.27.0`, `2.28.0`, `3.0.0`

---

## 🚀 **Deployment Architecture**

Each tagged version is deployed to its own subdirectory on the `gh-pages` branch:

```
gh-pages/
├── index.html          # Root version picker (auto-generated)
├── versions.json       # Version manifest (auto-generated)
└── v/
    ├── v2.26.0/        # Original v2.26.0
    ├── v2.26.1/        # v2.26.x with version switcher
    └── v2.27.0/        # Latest release
```

**Live URL structure:**
- Root: `petrdlouhy.github.io/boss-web-control/` → version picker
- Version: `petrdlouhy.github.io/boss-web-control/v/v2.27.0/`

Users can switch versions via the in-app dropdown or the root version picker page.

---

## 🔄 **Release Workflow**

### **During Development**
1. Make code changes
2. Reload browser — SW uses network-first, changes appear immediately
3. No version bumping needed during development

### **Releasing a Stable Version**
1. Set the stable version number in `app.js`, `constants.js`, `sw.js`
2. Update `HISTORY.md` with release notes
3. Commit: `git commit -m "Release vX.Y.Z"`
4. Tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
5. Push: `git push origin master && git push origin vX.Y.Z`
6. The GitHub Actions workflow automatically:
   - Copies app files to `gh-pages/v/vX.Y.Z/`
   - Updates `versions.json` manifest
   - Regenerates the root `index.html` version picker

### **Backporting to a Release Branch**
For cherry-picking fixes to older versions (e.g., `release/v2.26.x`):
1. `git checkout release/v2.26.x`
2. Apply changes, bump patch version
3. Tag and push: `git tag -a v2.26.2 -m "..." && git push origin v2.26.2`

---

## 🔢 **When to Increment**

- **Patch (2.27.0 → 2.27.1):** Bug fixes, small improvements
- **Minor (2.27.0 → 2.28.0):** New features
- **Major (2.27.0 → 3.0.0):** Breaking changes

---

## 📝 **Files to Update**

| File | What to update |
|------|---------------|
| `app.js` | `const VERSION = '...'` |
| `constants.js` | `CURRENT_VERSION: 'v...'` |
| `sw.js` | `const VERSION = '...'` |
| `HISTORY.md` | Release notes |

The `./bump` script handles the first three automatically for alpha increments.

---

## ⚙️ **GitHub Pages Setup**

GH Pages must be configured to serve from the `gh-pages` branch (root `/`).

Settings → Pages → Source: **Deploy from branch** → `gh-pages` / `/ (root)`

---

*The deploy workflow lives at `.github/workflows/deploy-version.yml`.*
