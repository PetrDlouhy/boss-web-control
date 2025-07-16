# GitHub Actions for Boss Cube Web Control

This directory contains the CI/CD workflows for the Boss Cube Web Control project.

## Overview

The GitHub Actions workflow was moved from the parent directory to the `boss-cube-web-control` project folder to consolidate testing within the actual project scope. This ensures that all CI/CD operations run within the correct project context.

## Workflow: `test.yml`

The main workflow performs comprehensive testing and quality checks on every push and pull request.

### Jobs

1. **🔬 Unit Tests** (`test`)
   - Runs headless tests using Puppeteer across Node.js 18.x and 20.x
   - Executes `npm test` which runs the `test-runner-headless.js`
   - Tests all core modules: PedalCommunication, BossCubeController, BossCubeCommunication, ReloadValues, TunerVisual
   - Uploads test results as artifacts

2. **🔍 Code Quality** (`lint`)
   - Validates JavaScript syntax across all `.js` files
   - Verifies presence of all required test files
   - Ensures project structure integrity

3. **🔒 Security Audit** (`security`)
   - Runs `npm audit` to check for high-severity vulnerabilities
   - Continues on error to avoid blocking CI for low-priority issues

4. **📁 Project Structure** (`validate-structure`)
   - Validates all required project files are present
   - Checks core application files: `index.html`, `app.js`, `sw.js`, `manifest.json`
   - Verifies core modules and directory structure
   - Ensures documentation files exist

5. **📈 Test Coverage Analysis** (`test-coverage`)
   - Analyzes test coverage across all modules
   - Counts test files and functions
   - Reports coverage for each core module

6. **🚀 Build Check** (`deploy-preview`)
   - Verifies build readiness and import paths
   - Validates service worker syntax
   - Checks manifest.json validity
   - Ensures all imports are resolvable

7. **📢 Test Results Summary** (`notification`)
   - Provides comprehensive status report
   - Summarizes all job results
   - Final pass/fail determination

## Migration from Parent Directory

**Previous location:** `../boss/.github/workflows/test.yml`  
**Current location:** `./boss-cube-web-control/.github/workflows/test.yml`

### Changes Made:

1. **Working Directory**: Removed `working-directory: ./boss-cube-web-control` since workflow now runs from project root
2. **Cache Path**: Updated from `boss-cube-web-control/package.json` to `package.json`
3. **Artifact Path**: Updated from `boss-cube-web-control/test-results.*` to `test-results.*`
4. **File Validation**: Added comprehensive project structure validation
5. **Build Verification**: Enhanced import path checking and manifest validation

## Test Coverage

The workflow ensures coverage of:

- **PedalCommunication**: MIDI pedal handling and BLE communication
- **BossCubeController**: Parameter reading and control flow
- **BossCubeCommunication**: SysEx parsing and tuner data processing
- **ReloadValues**: UI integration and error handling
- **TunerVisual**: Visual tuner display and mathematical accuracy

## Usage

The workflow automatically runs on:
- Push to `main`, `master`, or `develop` branches
- Pull requests targeting these branches
- Changes to any files in the project

## Local Testing

To run the same tests locally:

```bash
# Run all tests
npm test

# Run syntax checking
npm run lint

# Security audit
npm audit --audit-level=high

# Start development server
npm start
```

## Version

This GitHub Actions setup is configured for Boss Cube Web Control v2.24.0+ 