export {};

import '../../../../public/global';
import '../../../../global';

declare global {
    interface TemplateVariable {
        description: string;
        defaultValue: string;
    }

    interface RegexPatternConfig {
        name: string;
        pattern: string;
        flags: string;
        description: string;
    }

    interface TemplateConfig {
        name: string;
        configKey: string;
        role: 'system' | 'assistant';
        defaultEnabled: boolean;
        description: string;
        content: string;
    }

    interface TemplateConfigFile {
        variables: Record<string, TemplateVariable>;
        regexPatterns: Record<string, RegexPatternConfig>;
        templates: Record<string, TemplateConfig>;
    }

    interface ClavisSalomonisSettings {
        enabled: boolean;
        templateMode: 'default' | 'custom';
        enableIdentityReset: boolean;
        enableScenarioFramework: boolean;
        enableAISelfPersuasion: boolean;
        enableRoleplayInduction: boolean;
        enableDisclaimer: boolean;
        enableSafetyStatement: boolean;
        injectionDepth: number;
        injectionPosition: number;
        injectionOrder: number;
        enableRegexFilter: boolean;
        hideThoughtChain: boolean;
        hideDisclaimer: boolean;
        customTemplates: TemplateConfigFile | null;
    }

    interface BypassPrompt {
        role: 'system' | 'assistant' | 'user';
        content: string;
    }

    function clavisSalomonisInterceptor(
        chat: any[],
        contextSize: number,
        abort: (preventSubsequent?: boolean) => void,
        type: string
    ): Promise<void>;
}
