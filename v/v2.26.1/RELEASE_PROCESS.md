# Boss Cube Web Control - Release Process

**Simple versioning for development and releases**

---

## 📋 **Version Format**

**Development:** `2.22.14-alpha.1`, `2.22.14-alpha.2`, etc.  
**Stable:** `2.22.15`, `2.23.0`, `3.0.0`

---

## 🔄 **Development Workflow**

### **During Development**
1. **Increment appendix** after each change: `-alpha.1` → `-alpha.2`
2. **Update these files:**
   - `package.json` - version number
   - `README.md` - current version
   - `HISTORY.md` - changelog entry

### **For Stable Releases**
1. **Remove appendix:** `2.22.14-alpha.5` → `2.22.15`
2. **Update same files** with stable version
3. **Create git tag** (optional)

---

## 🚀 **When to Increment**

- **Patch (2.22.14 → 2.22.15):** Bug fixes, small improvements
- **Minor (2.22.14 → 2.23.0):** New features 
- **Major (2.22.14 → 3.0.0):** Breaking changes

---

## 📝 **Files to Update**

- `package.json` - main version
- `README.md` - current version display
- `HISTORY.md` - changelog
- `manifest.json` - PWA version (if needed)

---

*Keep it simple: increment appendix during development, make stable releases when ready.* 