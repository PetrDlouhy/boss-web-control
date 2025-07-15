#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Increment Development Version Script
 * Automatically increments the appendix part of development versions
 * (e.g., 2.23.1-alpha.1 -> 2.23.1-alpha.2)
 */

const FILES_TO_UPDATE = [
    'constants.js',
    'app.js', 
    'sw.js'
];

function getCurrentVersion() {
    const constantsPath = 'constants.js';
    const content = fs.readFileSync(constantsPath, 'utf8');
    const match = content.match(/CURRENT_VERSION: 'v(.+?)'/);
    if (!match) {
        throw new Error('Could not find version in constants.js');
    }
    return match[1];
}

function incrementVersion(version) {
    // Handle development versions: 2.23.1-alpha.1 -> 2.23.1-alpha.2
    const devMatch = version.match(/^(.+)-(alpha|beta|rc)\.(\d+)$/);
    if (devMatch) {
        const [, baseVersion, stage, number] = devMatch;
        const newNumber = parseInt(number) + 1;
        return `${baseVersion}-${stage}.${newNumber}`;
    }
    
    // Handle stable versions: 2.23.1 -> 2.23.2-alpha.1
    const stableMatch = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (stableMatch) {
        const [, major, minor, patch] = stableMatch;
        const newPatch = parseInt(patch) + 1;
        return `${major}.${minor}.${newPatch}-alpha.1`;
    }
    
    throw new Error(`Unknown version format: ${version}`);
}

function updateFile(filePath, oldVersion, newVersion) {
    let content = fs.readFileSync(filePath, 'utf8');
    let updated = false;
    
    // Update different version patterns in each file
    if (filePath === 'constants.js') {
        content = content.replace(
            /CURRENT_VERSION: 'v.+?'/,
            `CURRENT_VERSION: 'v${newVersion}'`
        );
        updated = true;
    } else if (filePath === 'app.js' || filePath === 'sw.js') {
        content = content.replace(
            /const VERSION = '.+?';/,
            `const VERSION = '${newVersion}';`
        );
        updated = true;
    }
    
    if (updated) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Updated ${filePath}: ${oldVersion} -> ${newVersion}`);
    } else {
        console.log(`⚠️  No version pattern found in ${filePath}`);
    }
}

function main() {
    try {
        // Get current version
        const currentVersion = getCurrentVersion();
        console.log(`📋 Current version: ${currentVersion}`);
        
        // Increment version
        const newVersion = incrementVersion(currentVersion);
        console.log(`🚀 New version: ${newVersion}`);
        
        // Update all files
        console.log('\n📝 Updating files...');
        FILES_TO_UPDATE.forEach(file => {
            updateFile(file, currentVersion, newVersion);
        });
        
        console.log(`\n✨ Version increment complete: ${currentVersion} -> ${newVersion}`);
        console.log('🔄 Refresh your browser to see the changes!');
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

main(); 