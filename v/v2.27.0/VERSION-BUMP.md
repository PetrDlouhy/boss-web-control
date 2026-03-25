# Version Bump Scripts

Quick reference for incrementing development versions during active development.

## 📚 Usage Options

### **Option 1: Quick Bash Script (Fastest)**
```bash
./bump
```

### **Option 2: Node.js Script (Direct)**
```bash
node increment-version.js
```

### **Option 3: NPM Script (Standard)**
```bash
npm run bump
```

## 🔄 How It Works

- **Automatically detects** current version from `constants.js`
- **Increments appendix**: `2.23.1-alpha.1` → `2.23.1-alpha.2`
- **Updates all files**: `constants.js`, `app.js`, `sw.js`
- **Forces cache refresh** on mobile/browser

## 📝 Version Formats Supported

- **Development**: `2.23.1-alpha.1` → `2.23.1-alpha.2`
- **Beta**: `2.23.1-beta.1` → `2.23.1-beta.2`  
- **Release Candidate**: `2.23.1-rc.1` → `2.23.1-rc.2`
- **Stable to Dev**: `2.23.1` → `2.23.2-alpha.1`

## ⚡ Speed Comparison

| Method | Speed | Use Case |
|--------|-------|----------|
| `./bump` | **Fastest** | Quick development iterations |
| `npm run bump` | Fast | Standard workflow |
| `node increment-version.js` | Fast | Direct execution |
| Manual editing | Slow | ❌ Avoid during development |

---

*Use `./bump` for rapid development cycles with cache busting.* 