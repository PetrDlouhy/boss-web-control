// Template Loader Utility
// Handles loading HTML templates and variable substitution

class TemplateLoader {
    constructor() {
        this.templateCache = new Map();
    }

    async loadTemplate(templatePath) {
        if (this.templateCache.has(templatePath)) {
            return this.templateCache.get(templatePath);
        }

        try {
            const response = await fetch(templatePath);
            if (!response.ok) {
                throw new Error(`Failed to load template: ${templatePath}`);
            }
            
            const template = await response.text();
            this.templateCache.set(templatePath, template);
            return template;
        } catch (error) {
            console.error(`Error loading template ${templatePath}:`, error);
            throw error;
        }
    }

    substituteVariables(template, variables) {
        let result = template;
        
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            result = result.replace(new RegExp(placeholder, 'g'), value);
        }
        
        return result;
    }

    async renderTemplate(templatePath, variables = {}) {
        const template = await this.loadTemplate(templatePath);
        return this.substituteVariables(template, variables);
    }

    clearCache() {
        this.templateCache.clear();
    }
}

export default TemplateLoader; 